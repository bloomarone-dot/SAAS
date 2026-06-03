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
from app.modules.permissions.models import Permission
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


def dashboard_period(start_date: datetime | None, end_date: datetime | None) -> tuple[datetime | None, datetime | None]:
    if not start_date and not end_date:
        return None, None
    end = end_date or datetime.utcnow()
    start = start_date or (end - timedelta(days=30))
    return start, end


def build_sales_metrics(db: Session, restaurant_id: str, start_date: datetime | None = None, end_date: datetime | None = None) -> dict:
    query = (
        db.query(CustomerOrder)
        .options(selectinload(CustomerOrder.items))
        .filter(CustomerOrder.restaurant_id == restaurant_id)
        .filter(CustomerOrder.status.in_(PAID_STATUSES))
    )
    if start_date:
        query = query.filter(CustomerOrder.updated_at >= start_date)
    if end_date:
        query = query.filter(CustomerOrder.updated_at <= end_date)
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
            func.coalesce(func.sum(StockRecipeIngredient.quantity_per_dish * StockItem.cmup_current), 0),
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

    return (
        db.query(StockItem)
        .filter(StockItem.restaurant_id == restaurant_id)
        .filter((StockItem.quantity + StockItem.kitchen_quantity + StockItem.drink_quantity) <= StockItem.alert_threshold)
        .count()
    )


def latest_low_stock_items(db: Session, restaurant_id: str) -> list[StockItem]:
    if not stock_low_stock_columns_available(db):
        return []

    return (
        db.query(StockItem)
        .filter(StockItem.restaurant_id == restaurant_id)
        .filter((StockItem.quantity + StockItem.kitchen_quantity + StockItem.drink_quantity) <= StockItem.alert_threshold)
        .order_by(StockItem.updated_at.desc())
        .limit(3)
        .all()
    )


def stock_low_stock_columns_available(db: Session) -> bool:
    inspector = inspect(db.bind)
    if "stock_items" not in inspector.get_table_names():
        return False
    existing = {column["name"] for column in inspector.get_columns("stock_items")}
    return {"quantity", "kitchen_quantity", "drink_quantity", "alert_threshold", "updated_at"}.issubset(existing)


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
