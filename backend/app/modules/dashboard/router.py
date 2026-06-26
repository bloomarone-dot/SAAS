from datetime import datetime, timedelta

from sqlalchemy import MetaData, Table, func, inspect, select
from sqlalchemy.orm import Session, selectinload
from fastapi import APIRouter, Depends, Query

from app.database import get_db
from app.dependencies import assert_permission, require_tenant_user
from app.modules.branches.models import Branch
from app.modules.catalog.classification import classify_sale_channel
from app.modules.catalog.models import MenuCategory, MenuItem
from app.modules.dashboard.schemas import (
    AdminDashboardActivity,
    AdminDashboardBranchPoint,
    AdminDashboardCashRegisterPoint,
    AdminDashboardSummaryOut,
    AdminDashboardWeeklyPoint,
)
from app.modules.orders.models import CustomerOrder
from app.modules.permissions.models import Permission, Role
from app.modules.stock.models import StockItem, StockRecipeIngredient
from app.modules.users.models import User

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

ORDER_TABLE_CANDIDATES = ("customer_orders", "orders", "commandes", "restaurant_orders", "sales")
REVENUE_COLUMN_CANDIDATES = (
    "total_amount",
    "total",
    "amount",
    "grand_total",
    "net_amount",
    "paid_amount",
)
PAID_STATUSES = {"Payée", "Payee"}
EXCLUDED_ACTIVE_STATUSES = {"Annulée", "Annulee", "Archivée", "Archivee"}
CASH_REGISTERS = {
    "REPAS": "Caisse repas",
    "BOISSON": "Caisse boisson",
}


@router.get("/cashier-summary", response_model=list[AdminDashboardCashRegisterPoint])
def cashier_summary(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.CASHIER_READ)
    metrics = build_sales_metrics(db, current_user.restaurant_id)
    return build_cash_register_points(metrics)


def read_orders_and_revenue(
    db: Session,
    restaurant_id: str,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> tuple[int, float]:
    """Lit les commandes si un module ventes existe deja, sinon retourne zero.

    Le projet n'a pas encore de module commandes persistant. Cette fonction rend
    le dashboard compatible avec une future table de ventes sans afficher de
    fausses donnees en attendant.
    """
    inspector = inspect(db.bind)
    existing_tables = set(inspector.get_table_names())
    table_name = next((name for name in ORDER_TABLE_CANDIDATES if name in existing_tables), None)
    if not table_name:
        return 0, 0.0

    metadata = MetaData()
    table = Table(table_name, metadata, autoload_with=db.bind)
    if "restaurant_id" not in table.c:
        return 0, 0.0

    filters = [table.c.restaurant_id == restaurant_id]
    if start_date is not None and "created_at" in table.c:
        filters.append(table.c.created_at >= start_date)
    if end_date is not None and "created_at" in table.c:
        filters.append(table.c.created_at <= end_date)
    orders_count = db.execute(select(func.count()).select_from(table).where(*filters)).scalar() or 0

    revenue_column_name = next((name for name in REVENUE_COLUMN_CANDIDATES if name in table.c), None)
    if not revenue_column_name:
        return int(orders_count), 0.0

    revenue = (
        db.execute(select(func.coalesce(func.sum(table.c[revenue_column_name]), 0)).where(*filters)).scalar()
        or 0
    )
    return int(orders_count), float(revenue)


@router.get("/admin-summary", response_model=AdminDashboardSummaryOut)
def admin_summary(
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_permission(current_user, Permission.RESTAURANT_SETTINGS_READ)
    restaurant_id = current_user.restaurant_id
    period_start, period_end = dashboard_period(start_date, end_date)
    orders_count, revenue = read_orders_and_revenue(db, restaurant_id, period_start, period_end)
    sales_metrics = build_sales_metrics(db, restaurant_id, period_start, period_end)
    revenue = sales_metrics["revenue"]
    active_branches = (
        db.query(Branch)
        .filter(Branch.restaurant_id == restaurant_id)
        .filter(Branch.is_active.is_(True))
        .count()
    )
    users_query = db.query(User).filter(User.restaurant_id == restaurant_id)
    branches = build_branch_points(db, restaurant_id, revenue, sales_metrics)
    low_stock_count = count_low_stock(db, restaurant_id)

    return AdminDashboardSummaryOut(
        revenue=revenue,
        orders_count=orders_count,
        branches_count=active_branches,
        users_count=users_query.count(),
        active_users_count=users_query.filter(User.is_active.is_(True)).count(),
        profit=sales_metrics["profit"],
        meal_revenue=sales_metrics["by_channel"]["REPAS"]["revenue"],
        drink_revenue=sales_metrics["by_channel"]["BOISSON"]["revenue"],
        cash_registers=build_cash_register_points(sales_metrics),
        weekly_revenue=build_weekly_revenue(db, restaurant_id, period_start, period_end),
        branches=branches,
        top_branches=sorted(branches, key=lambda item: (item.revenue, item.active_users_count), reverse=True)[:3],
        recent_activities=build_recent_activities(db, restaurant_id),
        low_stock_count=low_stock_count,
    )


REALTIME_STATUS_KEYS = {
    "En préparation": "preparing",
    "Prête": "ready",
    "Livrée": "delivered",
    "Payée": "paid",
    "Payee": "paid",
    "Annulée": "cancelled",
    "Nouvelle": "new",
    "Acceptée": "accepted",
    "PENDING_PAYMENT": "pending_payment",
}


def _analytics_bounds(start_date, end_date):
    """Période par défaut = aujourd'hui ; sinon respecte start/end fournis."""
    now = datetime.utcnow()
    if not start_date and not end_date:
        start = datetime.combine(now.date(), datetime.min.time())
        end = datetime.combine(now.date(), datetime.max.time())
    else:
        end = end_date or now
        start = start_date or datetime.combine(end.date(), datetime.min.time())
    return start, end


def _variation(today_value: float, previous_value: float) -> float | None:
    """Variation % vs période précédente. None si pas de base de comparaison."""
    if not previous_value:
        return None
    return round((today_value - previous_value) / previous_value * 100, 1)


def _channel_set(category: str | None) -> set[str]:
    if category == "meal":
        return {"REPAS"}
    if category == "drink":
        return {"BOISSON"}
    return {"REPAS", "BOISSON"}


def _paid_orders(db: Session, restaurant_id: str, start: datetime, end: datetime, branch_id: str | None = None):
    query = (
        db.query(CustomerOrder)
        .options(selectinload(CustomerOrder.items))
        .filter(
            CustomerOrder.restaurant_id == restaurant_id,
            CustomerOrder.status.in_(PAID_STATUSES),
            CustomerOrder.deleted_at.is_(None),
            func.coalesce(CustomerOrder.paid_at, CustomerOrder.updated_at) >= start,
            func.coalesce(CustomerOrder.paid_at, CustomerOrder.updated_at) <= end,
        )
    )
    if branch_id:
        query = query.filter(CustomerOrder.branch_id == branch_id)
    return query.all()


def compute_hourly_sales(orders, start_hour: int = 8, end_hour: int = 22) -> list[dict]:
    buckets = {hour: 0.0 for hour in range(start_hour, end_hour + 1)}
    for order in orders:
        hour = (order.updated_at or order.created_at).hour
        if hour in buckets:
            buckets[hour] += float(order.total_amount or 0)
    return [{"hour": f"{hour:02d}h", "revenue": round(value, 2)} for hour, value in buckets.items()]


def compute_top_products(orders, menu_ctx, category: str | None, limit: int = 8) -> list[dict]:
    channels = _channel_set(category)
    agg: dict[str, dict] = {}
    for order in orders:
        for item in order.items:
            channel = infer_order_item_channel(item, menu_ctx)
            if channel not in channels:
                continue
            row = agg.setdefault(item.name, {"name": item.name, "category": channel, "quantity": 0, "revenue": 0.0})
            row["quantity"] += int(item.quantity or 0)
            row["revenue"] += float(item.line_total or 0)
    return sorted(agg.values(), key=lambda r: r["revenue"], reverse=True)[:limit]


def compute_payment_methods(orders) -> list[dict]:
    agg: dict[str, float] = {}
    for order in orders:
        method = (order.payment_method or "Non renseigné").strip() or "Non renseigné"
        agg[method] = agg.get(method, 0.0) + float(order.total_amount or 0)
    total = sum(agg.values()) or 0
    rows = [
        {"method": method, "amount": round(amount, 2), "share": round(amount / total * 100, 1) if total else 0}
        for method, amount in agg.items()
    ]
    return sorted(rows, key=lambda r: r["amount"], reverse=True)


def compute_employee_performance(db: Session, restaurant_id: str, orders, limit: int = 8) -> list[dict]:
    names = {
        user.id: f"{user.first_name} {user.last_name}".strip() or user.username
        for user in db.query(User).filter(User.restaurant_id == restaurant_id).all()
    }
    agg: dict[str, dict] = {}
    for order in orders:
        if not order.server_id:
            continue
        row = agg.setdefault(order.server_id, {"name": names.get(order.server_id, "—"), "revenue": 0.0, "orders": 0})
        row["revenue"] += float(order.total_amount or 0)
        row["orders"] += 1
    for row in agg.values():
        row["average_ticket"] = round(row["revenue"] / row["orders"], 0) if row["orders"] else 0
        row["revenue"] = round(row["revenue"], 2)
    return sorted(agg.values(), key=lambda r: r["revenue"], reverse=True)[:limit]


def compute_realtime_orders(db: Session, restaurant_id: str) -> dict:
    rows = (
        db.query(CustomerOrder.status, func.count())
        .filter(CustomerOrder.restaurant_id == restaurant_id)
        .filter(CustomerOrder.deleted_at.is_(None))
        .filter(~CustomerOrder.status.in_({"Archivée", "Archivee"}))
        .group_by(CustomerOrder.status)
        .all()
    )
    counts = {key: 0 for key in set(REALTIME_STATUS_KEYS.values())}
    for status_value, count in rows:
        key = REALTIME_STATUS_KEYS.get(status_value)
        if key:
            counts[key] += int(count)
    counts["in_progress"] = counts.get("new", 0) + counts.get("accepted", 0) + counts.get("preparing", 0) + counts.get("ready", 0)
    return counts


def compute_stock_alerts(db: Session, restaurant_id: str, limit: int = 10) -> list[dict]:
    if not stock_low_stock_columns_available(db):
        return []
    from app.modules.stock.router import get_current_stock

    items = (
        db.query(StockItem)
        .filter(StockItem.restaurant_id == restaurant_id, StockItem.is_active.is_(True))
        .all()
    )
    alerts = []
    for item in items:
        current = get_current_stock(db, item.id, restaurant_id=restaurant_id)
        threshold = float(item.minimum_stock or 0)
        if threshold > 0 and current <= threshold:
            alerts.append({
                "id": item.id,
                "name": item.name,
                "current_stock": round(current, 2),
                "minimum_stock": threshold,
            })
    alerts.sort(key=lambda a: a["current_stock"] - a["minimum_stock"])
    return alerts[:limit]


def _scoped_channel_totals(metrics: dict, branch_id: str | None, channels: set[str]):
    """(revenue, profit, orders_count, meal_revenue, drink_revenue) scopé sur une branche."""
    if branch_id:
        branch = metrics["by_branch"].get(branch_id)
        if not branch:
            return 0.0, 0.0, 0, 0.0, 0.0
        by_channel = branch["by_channel"]
        orders_count = len(branch["orders"])
    else:
        by_channel = metrics["by_channel"]
        orders_count = metrics["orders_count"]
    revenue = sum(by_channel[ch]["revenue"] for ch in channels)
    profit = sum(by_channel[ch]["profit"] for ch in channels)
    return revenue, profit, orders_count, by_channel["REPAS"]["revenue"], by_channel["BOISSON"]["revenue"]


@router.get("/analytics")
def dashboard_analytics(
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    branch_id: str | None = Query(default=None),
    category: str | None = Query(default=None),
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    """Agrégat unique alimentant le dashboard moderne (KPIs, graphes, sections)."""
    assert_permission(current_user, Permission.RESTAURANT_SETTINGS_READ)
    restaurant_id = current_user.restaurant_id
    start, end = _analytics_bounds(start_date, end_date)

    metrics = build_sales_metrics(db, restaurant_id, start, end)
    channels = _channel_set(category)
    revenue, profit, orders_count, meal_revenue, drink_revenue = _scoped_channel_totals(metrics, branch_id, channels)

    # Comparaison avec la période équivalente précédente (vs hier par défaut).
    duration = end - start
    prev_metrics = build_sales_metrics(db, restaurant_id, start - duration, start)
    prev_revenue, _prev_profit, prev_orders, _pm, _pd = _scoped_channel_totals(prev_metrics, branch_id, channels)

    orders = _paid_orders(db, restaurant_id, start, end, branch_id)
    menu_ctx = read_menu_item_context(db, restaurant_id)
    average_ticket = round(revenue / orders_count, 0) if orders_count else 0
    prev_ticket = round(prev_revenue / prev_orders, 0) if prev_orders else 0

    return {
        "period": {"start": start.isoformat(), "end": end.isoformat()},
        "kpis": {
            "revenue": round(revenue, 2),
            "revenue_variation": _variation(revenue, prev_revenue),
            "profit": round(profit, 2),
            "orders_count": orders_count,
            "orders_variation": _variation(orders_count, prev_orders),
            "average_ticket": average_ticket,
            "average_ticket_variation": _variation(average_ticket, prev_ticket),
            "margin_rate": round(profit / revenue * 100, 1) if revenue else 0,
            "clients_served": orders_count,
        },
        "hourly_sales": compute_hourly_sales(orders),
        "sales_chart": build_weekly_revenue(db, restaurant_id, start, end),
        "meal_vs_drink": {
            "meal": round(meal_revenue, 2),
            "drink": round(drink_revenue, 2),
        },
        "top_products": compute_top_products(orders, menu_ctx, category),
        "payment_methods": compute_payment_methods(orders),
        "employee_performance": compute_employee_performance(db, restaurant_id, orders),
        "realtime_orders": compute_realtime_orders(db, restaurant_id),
        "stock_alerts": compute_stock_alerts(db, restaurant_id),
        "branches": [point.model_dump() for point in build_branch_points(db, restaurant_id, revenue or 1, metrics)],
    }


@router.get("/server-performance")
def server_performance(
    period: str = Query(default="week", pattern="^(week|month)$"),
    server_id: str | None = Query(default=None),
    branch_id: str | None = Query(default=None),
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    if current_user.role not in {Role.ADMIN, Role.MANAGER}:
        assert_permission(current_user, Permission.RESTAURANT_SETTINGS_READ)
    start, end = performance_period(period)
    prev_start, prev_end = previous_period(start, end)
    rows = aggregate_server_performance(db, current_user.restaurant_id, start, end, server_id, branch_id)
    prev_rows = aggregate_server_performance(db, current_user.restaurant_id, prev_start, prev_end, server_id, branch_id)
    previous_by_id = {row["server_id"]: row for row in prev_rows}
    for index, row in enumerate(rows, start=1):
        previous = previous_by_id.get(row["server_id"], {})
        row["rank"] = index
        row["revenue_variation"] = _variation(row["revenue"], previous.get("revenue", 0))
        row["orders_variation"] = _variation(row["orders_taken"], previous.get("orders_taken", 0))
    totals = performance_totals(rows, revenue_key="revenue", count_key="orders_taken")
    return {"period": {"type": period, "start": start.isoformat(), "end": end.isoformat()}, "kpis": totals, "ranking": rows}


@router.get("/cashier-performance")
def cashier_performance(
    period: str = Query(default="week", pattern="^(week|month)$"),
    cashier_id: str | None = Query(default=None),
    branch_id: str | None = Query(default=None),
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    if current_user.role not in {Role.ADMIN, Role.MANAGER}:
        assert_permission(current_user, Permission.CASHIER_READ)
    start, end = performance_period(period)
    prev_start, prev_end = previous_period(start, end)
    rows = aggregate_cashier_performance(db, current_user.restaurant_id, start, end, cashier_id, branch_id)
    prev_rows = aggregate_cashier_performance(db, current_user.restaurant_id, prev_start, prev_end, cashier_id, branch_id)
    previous_by_id = {row["cashier_id"]: row for row in prev_rows}
    for index, row in enumerate(rows, start=1):
        previous = previous_by_id.get(row["cashier_id"], {})
        row["rank"] = index
        row["collected_variation"] = _variation(row["total_collected"], previous.get("total_collected", 0))
        row["payments_variation"] = _variation(row["payments_validated"], previous.get("payments_validated", 0))
    totals = performance_totals(rows, revenue_key="total_collected", count_key="payments_validated")
    payment_modes: dict[str, float] = {}
    for row in rows:
        for method, amount in row["by_payment_method"].items():
            payment_modes[method] = payment_modes.get(method, 0) + amount
    return {"period": {"type": period, "start": start.isoformat(), "end": end.isoformat()}, "kpis": totals, "payment_modes": payment_modes, "ranking": rows}


def dashboard_period(start_date: datetime | None, end_date: datetime | None) -> tuple[datetime | None, datetime | None]:
    if not start_date and not end_date:
        return None, None
    end = end_date or datetime.utcnow()
    start = start_date or (end - timedelta(days=30))
    return start, end


def performance_period(period: str) -> tuple[datetime, datetime]:
    now = datetime.utcnow()
    if period == "month":
        start = datetime(now.year, now.month, 1)
    else:
        start_day = now.date() - timedelta(days=now.weekday())
        start = datetime.combine(start_day, datetime.min.time())
    return start, now


def previous_period(start: datetime, end: datetime) -> tuple[datetime, datetime]:
    duration = end - start
    return start - duration, start


def performance_totals(rows: list[dict], revenue_key: str, count_key: str) -> dict:
    revenue = sum(float(row.get(revenue_key, 0) or 0) for row in rows)
    count = sum(int(row.get(count_key, 0) or 0) for row in rows)
    return {
        revenue_key: round(revenue, 2),
        count_key: count,
        "average_ticket": round(revenue / count, 0) if count else 0,
        "people_count": sum(int(row.get("clients_served", 0) or 0) for row in rows),
    }


def aggregate_server_performance(
    db: Session,
    restaurant_id: str,
    start: datetime,
    end: datetime,
    server_id: str | None = None,
    branch_id: str | None = None,
) -> list[dict]:
    query = (
        db.query(CustomerOrder)
        .filter(
            CustomerOrder.restaurant_id == restaurant_id,
            CustomerOrder.deleted_at.is_(None),
            CustomerOrder.server_id.isnot(None),
            CustomerOrder.created_at >= start,
            CustomerOrder.created_at <= end,
        )
    )
    if server_id:
        query = query.filter(CustomerOrder.server_id == server_id)
    if branch_id:
        query = query.filter(CustomerOrder.branch_id == branch_id)
    orders = query.all()
    names = user_name_map(db, restaurant_id)
    rows: dict[str, dict] = {}
    for order in orders:
        row = rows.setdefault(order.server_id, {
            "server_id": order.server_id,
            "name": names.get(order.server_id, "Serveur"),
            "orders_taken": 0,
            "orders_served": 0,
            "revenue": 0.0,
            "clients_served": 0,
            "tables_count": set(),
            "cancelled_orders": 0,
            "avg_service_minutes": 0,
        })
        row["orders_taken"] += 1
        row["clients_served"] += int(order.party_size or 1)
        if order.table_id:
            row["tables_count"].add(order.table_id)
        if order.status in PAID_STATUSES:
            row["orders_served"] += 1
            row["revenue"] += float(order.total_amount or 0)
        if order.status in {"Annulée", "Annulee"} or order.cancelled_at:
            row["cancelled_orders"] += 1
    result = []
    for row in rows.values():
        row["tables_count"] = len(row["tables_count"])
        row["average_ticket"] = round(row["revenue"] / row["orders_served"], 0) if row["orders_served"] else 0
        row["revenue"] = round(row["revenue"], 2)
        result.append(row)
    return sorted(result, key=lambda item: (item["revenue"], item["orders_served"]), reverse=True)


def aggregate_cashier_performance(
    db: Session,
    restaurant_id: str,
    start: datetime,
    end: datetime,
    cashier_id: str | None = None,
    branch_id: str | None = None,
) -> list[dict]:
    query = (
        db.query(CustomerOrder)
        .filter(
            CustomerOrder.restaurant_id == restaurant_id,
            CustomerOrder.deleted_at.is_(None),
            CustomerOrder.status.in_(PAID_STATUSES),
            CustomerOrder.cashier_id.isnot(None),
            func.coalesce(CustomerOrder.paid_at, CustomerOrder.updated_at) >= start,
            func.coalesce(CustomerOrder.paid_at, CustomerOrder.updated_at) <= end,
        )
    )
    if cashier_id:
        query = query.filter(CustomerOrder.cashier_id == cashier_id)
    if branch_id:
        query = query.filter(CustomerOrder.branch_id == branch_id)
    orders = query.all()
    names = user_name_map(db, restaurant_id)
    rows: dict[str, dict] = {}
    for order in orders:
        row = rows.setdefault(order.cashier_id, {
            "cashier_id": order.cashier_id,
            "name": names.get(order.cashier_id, "Caissier"),
            "total_collected": 0.0,
            "payments_validated": 0,
            "cash_payments": 0.0,
            "mobile_money_payments": 0.0,
            "card_payments": 0.0,
            "printed_receipts": 0,
            "payment_cancellations": 0,
            "cash_gap": 0,
            "by_payment_method": {},
        })
        amount = float(order.total_amount or 0)
        method = (order.payment_method or "Non renseigné").strip() or "Non renseigné"
        method_lower = method.lower()
        row["total_collected"] += amount
        row["payments_validated"] += 1
        row["printed_receipts"] += int(order.print_count or 0)
        row["by_payment_method"][method] = row["by_payment_method"].get(method, 0.0) + amount
        if "cash" in method_lower or "esp" in method_lower:
            row["cash_payments"] += amount
        elif "card" in method_lower or "carte" in method_lower:
            row["card_payments"] += amount
        elif "momo" in method_lower or "money" in method_lower or "orange" in method_lower or "mtn" in method_lower:
            row["mobile_money_payments"] += amount
    result = []
    for row in rows.values():
        row["average_ticket"] = round(row["total_collected"] / row["payments_validated"], 0) if row["payments_validated"] else 0
        row["total_collected"] = round(row["total_collected"], 2)
        result.append(row)
    return sorted(result, key=lambda item: (item["total_collected"], item["payments_validated"]), reverse=True)


def user_name_map(db: Session, restaurant_id: str) -> dict[str, str]:
    return {
        user.id: f"{user.first_name} {user.last_name}".strip() or user.username
        for user in db.query(User).filter(User.restaurant_id == restaurant_id).all()
    }


def build_sales_metrics(db: Session, restaurant_id: str, start_date: datetime | None = None, end_date: datetime | None = None) -> dict:
    query = (
        db.query(CustomerOrder)
        .options(selectinload(CustomerOrder.items))
        .filter(CustomerOrder.restaurant_id == restaurant_id)
        .filter(CustomerOrder.status.in_(PAID_STATUSES))
        .filter(CustomerOrder.deleted_at.is_(None))
    )
    if start_date:
        query = query.filter(func.coalesce(CustomerOrder.paid_at, CustomerOrder.updated_at) >= start_date)
    if end_date:
        query = query.filter(func.coalesce(CustomerOrder.paid_at, CustomerOrder.updated_at) <= end_date)
    orders = (
        query.all()
    )
    server_branch_by_id = {
        user.id: user.branch_id
        for user in db.query(User.id, User.branch_id)
        .filter(User.restaurant_id == restaurant_id)
        .all()
    }
    recipe_costs = read_recipe_costs(db, restaurant_id)
    menu_item_context = read_menu_item_context(db, restaurant_id)
    metrics = {
        "revenue": 0.0,
        "profit": 0.0,
        "orders_count": len(orders),
        "by_channel": empty_channel_metrics(),
        "by_branch": {},
    }
    for order in orders:
        branch_id = order.branch_id or server_branch_by_id.get(order.server_id) or "__main__"
        branch_metrics = metrics["by_branch"].setdefault(
            branch_id,
            {"revenue": 0.0, "profit": 0.0, "orders": set(), "by_channel": empty_channel_metrics()},
        )
        order_gross = sum(float(item.line_total or 0) for item in order.items) or float(order.total_amount or 0)
        discount_ratio = max(0.0, min(1.0, float(order.discount_amount or 0) / order_gross)) if order_gross else 0.0
        for item in order.items:
            channel = infer_order_item_channel(item, menu_item_context)
            line_revenue = float(item.line_total or 0) * (1 - discount_ratio)
            line_cost = recipe_costs.get(item.menu_item_id or "", 0.0) * int(item.quantity or 0)
            line_profit = line_revenue - line_cost
            metrics["revenue"] += line_revenue
            metrics["profit"] += line_profit
            metrics["by_channel"][channel]["revenue"] += line_revenue
            metrics["by_channel"][channel]["profit"] += line_profit
            metrics["by_channel"][channel]["orders"].add(order.id)
            branch_metrics["revenue"] += line_revenue
            branch_metrics["profit"] += line_profit
            branch_metrics["orders"].add(order.id)
            branch_metrics["by_channel"][channel]["revenue"] += line_revenue
            branch_metrics["by_channel"][channel]["profit"] += line_profit
            branch_metrics["by_channel"][channel]["orders"].add(order.id)
    return metrics


def empty_channel_metrics() -> dict:
    return {
        "REPAS": {"revenue": 0.0, "profit": 0.0, "orders": set()},
        "BOISSON": {"revenue": 0.0, "profit": 0.0, "orders": set()},
    }


def read_recipe_costs(db: Session, restaurant_id: str) -> dict[str, float]:
    manual_rows = (
        db.query(MenuItem.id, MenuItem.cost_per_dish)
        .filter(MenuItem.restaurant_id == restaurant_id, MenuItem.cost_per_dish > 0)
        .all()
    )
    manual_costs = {menu_item_id: float(cost or 0) for menu_item_id, cost in manual_rows}
    rows = (
        db.query(
            StockRecipeIngredient.menu_item_id,
            func.coalesce(func.sum(StockRecipeIngredient.quantity_per_dish * StockItem.purchase_price), 0),
        )
        .join(StockItem, StockItem.id == StockRecipeIngredient.stock_item_id)
        .filter(StockRecipeIngredient.restaurant_id == restaurant_id)
        .group_by(StockRecipeIngredient.menu_item_id)
        .all()
    )
    recipe_costs = {menu_item_id: float(cost or 0) for menu_item_id, cost in rows}
    return {**recipe_costs, **manual_costs}


def read_menu_item_context(db: Session, restaurant_id: str) -> dict[str, tuple[str | None, str | None, str | None, str | None, str | None]]:
    rows = (
        db.query(MenuItem.id, MenuItem.name, MenuItem.description, MenuItem.sale_channel, MenuCategory.name, MenuCategory.description)
        .outerjoin(MenuCategory, MenuCategory.id == MenuItem.category_id)
        .filter(MenuItem.restaurant_id == restaurant_id)
        .all()
    )
    return {
        item_id: (name, description, sale_channel, category_name, category_description)
        for item_id, name, description, sale_channel, category_name, category_description in rows
    }


def infer_order_item_channel(item, menu_item_context: dict[str, tuple[str | None, str | None, str | None, str | None, str | None]]) -> str:
    menu_name, menu_description, stored_channel, category_name, category_description = menu_item_context.get(item.menu_item_id or "", (None, None, None, None, None))
    detected = classify_sale_channel(item.name, menu_name, menu_description, category_name, category_description)
    if detected == "BOISSON":
        return "BOISSON"
    return "BOISSON" if stored_channel == "BOISSON" else "REPAS"


def build_cash_register_points(metrics: dict) -> list[AdminDashboardCashRegisterPoint]:
    total = metrics["revenue"] or 0
    points = []
    for key, label in CASH_REGISTERS.items():
        data = metrics["by_channel"][key]
        revenue = float(data["revenue"] or 0)
        points.append(
            AdminDashboardCashRegisterPoint(
                key=key,
                label=label,
                revenue=revenue,
                profit=float(data["profit"] or 0),
                orders_count=len(data["orders"]),
                share=(revenue / total * 100) if total else 0,
            )
        )
    return points


def build_weekly_revenue(
    db: Session,
    restaurant_id: str,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> list[AdminDashboardWeeklyPoint]:
    end_day = (end_date or datetime.utcnow()).date()
    days = [end_day - timedelta(days=offset) for offset in range(6, -1, -1)]
    labels = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]
    totals = {day: {"revenue": 0.0, "orders_count": 0} for day in days}

    start = start_date or datetime.combine(days[0], datetime.min.time())
    end = end_date or datetime.combine(days[-1], datetime.max.time())
    orders = (
        db.query(CustomerOrder)
        .filter(CustomerOrder.restaurant_id == restaurant_id)
        .filter(CustomerOrder.status.in_(PAID_STATUSES))
        .filter(CustomerOrder.updated_at >= start)
        .filter(CustomerOrder.updated_at <= end)
        .all()
    )
    for order in orders:
        day = order.updated_at.date()
        if day in totals:
            totals[day]["revenue"] += float(order.total_amount or 0)
            totals[day]["orders_count"] += 1

    return [
        AdminDashboardWeeklyPoint(
            label=labels[day.weekday()],
            revenue=totals[day]["revenue"],
            orders_count=totals[day]["orders_count"],
        )
        for day in days
    ]


def build_branch_points(db: Session, restaurant_id: str, total_revenue: float, sales_metrics: dict) -> list[AdminDashboardBranchPoint]:
    branches = (
        db.query(Branch)
        .filter(Branch.restaurant_id == restaurant_id)
        .order_by(Branch.name.asc())
        .all()
    )
    if not branches:
        users_count = db.query(User).filter(User.restaurant_id == restaurant_id).count()
        active_users_count = (
            db.query(User)
            .filter(User.restaurant_id == restaurant_id, User.is_active.is_(True))
            .count()
        )
        return [
            AdminDashboardBranchPoint(
                id=None,
                name="Restaurant principal",
                city=None,
                revenue=total_revenue,
                meal_revenue=sales_metrics["by_channel"]["REPAS"]["revenue"],
                drink_revenue=sales_metrics["by_channel"]["BOISSON"]["revenue"],
                profit=sales_metrics["profit"],
                orders_count=sales_metrics["orders_count"],
                users_count=users_count,
                active_users_count=active_users_count,
                share=100 if total_revenue else 0,
            )
        ]

    users_by_branch = {
        branch.id: db.query(User).filter(User.branch_id == branch.id).count()
        for branch in branches
    }
    active_users_by_branch = {
        branch.id: db.query(User).filter(User.branch_id == branch.id, User.is_active.is_(True)).count()
        for branch in branches
    }
    points = []
    main_branch_data = sales_metrics["by_branch"].get("__main__")
    if main_branch_data:
        main_revenue = float(main_branch_data["revenue"] or 0)
        points.append(
            AdminDashboardBranchPoint(
                id=None,
                name="Restaurant principal",
                city=None,
                revenue=main_revenue,
                meal_revenue=main_branch_data["by_channel"]["REPAS"]["revenue"],
                drink_revenue=main_branch_data["by_channel"]["BOISSON"]["revenue"],
                profit=float(main_branch_data["profit"] or 0),
                orders_count=len(main_branch_data["orders"]),
                users_count=0,
                active_users_count=0,
                share=(main_revenue / total_revenue * 100) if total_revenue else 0,
            )
        )
    for branch in branches:
        branch_data = sales_metrics["by_branch"].get(branch.id, {"revenue": 0.0, "profit": 0.0, "orders": set(), "by_channel": empty_channel_metrics()})
        branch_revenue = float(branch_data["revenue"] or 0)
        points.append(
            AdminDashboardBranchPoint(
                id=branch.id,
                name=branch.name,
                city=branch.city,
                revenue=branch_revenue,
                meal_revenue=branch_data["by_channel"]["REPAS"]["revenue"],
                drink_revenue=branch_data["by_channel"]["BOISSON"]["revenue"],
                profit=float(branch_data["profit"] or 0),
                orders_count=len(branch_data["orders"]),
                users_count=users_by_branch[branch.id],
                active_users_count=active_users_by_branch[branch.id],
                share=(branch_revenue / total_revenue * 100) if total_revenue else 0,
            )
        )
    return points


def build_recent_activities(db: Session, restaurant_id: str) -> list[AdminDashboardActivity]:
    activities: list[tuple[datetime, AdminDashboardActivity]] = []
    latest_users = (
        db.query(User)
        .filter(User.restaurant_id == restaurant_id)
        .order_by(User.created_at.desc())
        .limit(3)
        .all()
    )
    for user in latest_users:
        activities.append((
            user.created_at,
            AdminDashboardActivity(
                label="Utilisateur ajouté",
                value=f"{user.first_name} {user.last_name}",
                time=format_activity_time(user.created_at),
            ),
        ))

    latest_orders = (
        db.query(CustomerOrder)
        .filter(CustomerOrder.restaurant_id == restaurant_id)
        .order_by(CustomerOrder.created_at.desc())
        .limit(3)
        .all()
    )
    for order in latest_orders:
        activities.append((
            order.created_at,
            AdminDashboardActivity(
                label="Commande",
                value=order.order_number,
                time=format_activity_time(order.created_at),
            ),
        ))

    for item in latest_low_stock_items(db, restaurant_id):
        activities.append(
            (
                item.updated_at,
                AdminDashboardActivity(
                    label="Stock faible détecté",
                    value=item.name,
                    time=format_activity_time(item.updated_at),
                ),
            )
        )

    return [activity for _, activity in sorted(activities, key=lambda row: row[0], reverse=True)[:5]]


def count_low_stock(db: Session, restaurant_id: str) -> int:
    if not stock_low_stock_columns_available(db):
        return 0
    from app.modules.stock.router import get_current_stock

    items = db.query(StockItem).filter(StockItem.restaurant_id == restaurant_id, StockItem.is_active.is_(True)).all()
    return len([item for item in items if get_current_stock(db, item.id, restaurant_id=restaurant_id) <= float(item.minimum_stock or 0)])


def latest_low_stock_items(db: Session, restaurant_id: str) -> list[StockItem]:
    if not stock_low_stock_columns_available(db):
        return []
    from app.modules.stock.router import get_current_stock

    items = db.query(StockItem).filter(StockItem.restaurant_id == restaurant_id, StockItem.is_active.is_(True)).order_by(StockItem.updated_at.desc()).all()
    return [item for item in items if get_current_stock(db, item.id, restaurant_id=restaurant_id) <= float(item.minimum_stock or 0)][:3]


def stock_low_stock_columns_available(db: Session) -> bool:
    inspector = inspect(db.bind)
    if "products" not in inspector.get_table_names():
        return False
    existing = {column["name"] for column in inspector.get_columns("products")}
    return {"minimum_stock", "updated_at"}.issubset(existing) and "stock_movements" in inspector.get_table_names()


def format_activity_time(value: datetime) -> str:
    delta = datetime.utcnow() - value
    if delta.days > 0:
        return f"Il y a {delta.days} j"
    minutes = max(0, int(delta.total_seconds() // 60))
    if minutes >= 60:
        return f"Il y a {minutes // 60} h"
    if minutes <= 1:
        return "À l'instant"
    return f"Il y a {minutes} min"
