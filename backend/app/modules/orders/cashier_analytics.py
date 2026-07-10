from __future__ import annotations

from datetime import datetime, timedelta
import json

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.modules.audit.models import AuditLog
from app.modules.branches.models import Branch
from app.modules.orders.models import CustomerOrder
from app.modules.orders.schemas import (
    CashierBranchPerformance,
    CashierCashierPerformance,
    CashierHourlyPoint,
    CashierPaymentBreakdown,
    CashierReportAlert,
    CashierReportAnalytics,
    CashierRestaurantPerformance,
    CashierVarianceLine,
)
from app.modules.restaurants.models import Restaurant
from app.modules.users.models import User

PAID_STATUSES = {"Payée", "Payee"}
CANCELLED_STATUSES = {"Annulée", "Annulee"}


def _paid_orders_query(db: Session, restaurant_ids: list[str], start: datetime, end: datetime):
    return (
        db.query(CustomerOrder)
        .filter(
            CustomerOrder.restaurant_id.in_(restaurant_ids),
            CustomerOrder.deleted_at.is_(None),
            CustomerOrder.status.in_(PAID_STATUSES),
            func.coalesce(CustomerOrder.paid_at, CustomerOrder.updated_at) >= start,
            func.coalesce(CustomerOrder.paid_at, CustomerOrder.updated_at) <= end,
        )
    )


def _metrics_for_period(db: Session, restaurant_ids: list[str], start: datetime, end: datetime) -> tuple[float, int]:
    rows = (
        _paid_orders_query(db, restaurant_ids, start, end)
        .with_entities(
            func.coalesce(func.sum(CustomerOrder.total_amount), 0),
            func.count(CustomerOrder.id),
        )
        .one()
    )
    return float(rows[0] or 0), int(rows[1] or 0)


def _pct_change(current: float, previous: float) -> float | None:
    if previous <= 0:
        return None if current <= 0 else 100.0
    return round(((current - previous) / previous) * 100, 1)


def _normalize_payment_bucket(method: str | None) -> str:
    value = (method or "Non renseigné").strip()
    lower = value.lower()
    if "orange" in lower:
        return "Mobile Money Orange"
    if "mtn" in lower or "momo" in lower:
        return "Mobile Money MTN"
    if "mobile" in lower or "dépôt" in lower or "depot" in lower:
        return "Mobile Money"
    if "espèce" in lower or "espece" in lower or "cash" in lower:
        return "Espèces"
    if "carte" in lower or "card" in lower:
        return "Carte"
    return value


def build_payment_breakdown(receipts: list[CustomerOrder]) -> list[CashierPaymentBreakdown]:
    buckets: dict[str, float] = {}
    for order in receipts:
        bucket = _normalize_payment_bucket(order.payment_method)
        buckets[bucket] = buckets.get(bucket, 0) + float(order.total_amount or 0)
    total = sum(buckets.values()) or 0
    return [
        CashierPaymentBreakdown(
            method=method,
            amount=round(amount, 2),
            percentage=round((amount / total) * 100, 1) if total else 0,
        )
        for method, amount in sorted(buckets.items(), key=lambda item: item[1], reverse=True)
    ]


def build_hourly_sales(receipts: list[CustomerOrder]) -> list[CashierHourlyPoint]:
    buckets: dict[int, dict[str, float | int]] = {}
    for order in receipts:
        paid_at = order.paid_at or order.updated_at
        if not paid_at:
            continue
        hour = paid_at.hour
        if hour not in buckets:
            buckets[hour] = {"transactions": 0, "revenue": 0.0}
        buckets[hour]["transactions"] += 1
        buckets[hour]["revenue"] += float(order.total_amount or 0)
    return [
        CashierHourlyPoint(
            hour=hour,
            transactions=int(values["transactions"]),
            revenue=round(float(values["revenue"]), 2),
        )
        for hour, values in sorted(buckets.items())
    ]


def build_branch_performance(
    db: Session,
    restaurant_id: str,
    receipts: list[CustomerOrder],
    start: datetime,
    end: datetime,
) -> list[CashierBranchPerformance]:
    branches = (
        db.query(Branch)
        .filter(Branch.restaurant_id == restaurant_id)
        .order_by(Branch.name.asc())
        .all()
    )
    branch_names = {branch.id: branch.name for branch in branches}
    restaurant = db.get(Restaurant, restaurant_id)
    default_name = restaurant.name if restaurant else "Restaurant principal"

    grouped: dict[str | None, list[CustomerOrder]] = {}
    for order in receipts:
        grouped.setdefault(order.branch_id, []).append(order)
    if not grouped:
        grouped[None] = []

    now = end
    elapsed = now - start
    comparison_windows = {
        "yesterday": (start - timedelta(days=1), start - timedelta(days=1) + elapsed),
        "last_week": (start - timedelta(days=7), start - timedelta(days=7) + elapsed),
        "last_month": (start - timedelta(days=30), start - timedelta(days=30) + elapsed),
    }

    rows: list[CashierBranchPerformance] = []
    for branch_id, orders in grouped.items():
        revenue = sum(float(order.total_amount or 0) for order in orders)
        transactions = len(orders)
        comp: dict[str, float | None] = {}
        for label, (comp_start, comp_end) in comparison_windows.items():
            query = _paid_orders_query(db, [restaurant_id], comp_start, comp_end)
            if branch_id:
                query = query.filter(CustomerOrder.branch_id == branch_id)
            comp_revenue = sum(float(order.total_amount or 0) for order in query.all())
            comp[label] = _pct_change(revenue, comp_revenue)

        rows.append(
            CashierBranchPerformance(
                branch_id=branch_id,
                branch_name=branch_names.get(branch_id, default_name),
                revenue=round(revenue, 2),
                transactions=transactions,
                average_ticket=round(revenue / transactions, 2) if transactions else 0,
                comparison_yesterday=comp["yesterday"],
                comparison_last_week=comp["last_week"],
                comparison_last_month=comp["last_month"],
            )
        )

    rows.sort(key=lambda item: item.revenue, reverse=True)
    for index, row in enumerate(rows, start=1):
        row.rank = index
    return rows


def build_cashier_performance(
    db: Session,
    restaurant_id: str,
    receipts: list[CustomerOrder],
    start: datetime,
    end: datetime,
) -> list[CashierCashierPerformance]:
    cashier_ids = {order.cashier_id for order in receipts if order.cashier_id}
    users = (
        {user.id: user for user in db.query(User).filter(User.id.in_(cashier_ids)).all()}
        if cashier_ids
        else {}
    )
    branches = {
        branch.id: branch.name
        for branch in db.query(Branch).filter(Branch.restaurant_id == restaurant_id).all()
    }

    grouped: dict[str | None, dict[str, float | int]] = {}
    for order in receipts:
        key = order.cashier_id
        if key not in grouped:
            grouped[key] = {"transactions": 0, "amount": 0.0}
        grouped[key]["transactions"] += 1
        grouped[key]["amount"] += float(order.total_amount or 0)

    cancel_counts: dict[str | None, int] = {}
    cancel_rows = (
        db.query(AuditLog)
        .filter(
            AuditLog.restaurant_id == restaurant_id,
            AuditLog.action == "payment.cancel",
            AuditLog.created_at >= start,
            AuditLog.created_at <= end,
        )
        .all()
    )
    for entry in cancel_rows:
        cancel_counts[entry.user_id] = cancel_counts.get(entry.user_id, 0) + 1

    rows: list[CashierCashierPerformance] = []
    for cashier_id, stats in grouped.items():
        user = users.get(cashier_id)
        name = f"{user.first_name} {user.last_name}".strip() if user else "Non assigné"
        rows.append(
            CashierCashierPerformance(
                cashier_id=cashier_id,
                cashier_name=name,
                branch_name=branches.get(user.branch_id) if user and user.branch_id else None,
                transactions=int(stats["transactions"]),
                amount_collected=round(float(stats["amount"]), 2),
                cancellations=cancel_counts.get(cashier_id, 0),
                variance=0,
            )
        )
    rows.sort(key=lambda item: item.amount_collected, reverse=True)
    return rows


def build_variance_history(
    db: Session,
    restaurant_id: str,
    start: datetime,
    end: datetime,
) -> list[CashierVarianceLine]:
    rows = (
        db.query(AuditLog)
        .filter(
            AuditLog.restaurant_id == restaurant_id,
            AuditLog.action == "payment.cancel",
            AuditLog.created_at >= start,
            AuditLog.created_at <= end,
        )
        .order_by(AuditLog.created_at.desc())
        .limit(30)
        .all()
    )
    history: list[CashierVarianceLine] = []
    for entry in rows:
        details = {}
        if entry.details_json:
            try:
                details = json.loads(entry.details_json)
            except json.JSONDecodeError:
                details = {}
        amount = float(details.get("total_amount") or 0)
        history.append(
            CashierVarianceLine(
                label=f"Annulation paiement · {entry.entity_id or '-'}",
                amount=-abs(amount),
                reason=entry.description or "Annulation caisse",
                created_at=entry.created_at,
            )
        )
    return history


def build_alerts(
    *,
    total_collected: float,
    comparisons: dict[str, float | None],
    cancelled_count: int,
    refunded_count: int,
    payment_breakdown: list[CashierPaymentBreakdown],
) -> list[CashierReportAlert]:
    alerts: list[CashierReportAlert] = []
    if comparisons.get("yesterday") is not None and comparisons["yesterday"] <= -25:
        alerts.append(
            CashierReportAlert(
                level="warning",
                title="Baisse du chiffre d'affaires",
                message=f"Le CA est en baisse de {abs(comparisons['yesterday'])}% par rapport à hier à la même heure.",
            )
        )
    if cancelled_count >= 5:
        alerts.append(
            CashierReportAlert(
                level="warning",
                title="Annulations élevées",
                message=f"{cancelled_count} commandes annulées sur la période.",
            )
        )
    if refunded_count >= 3:
        alerts.append(
            CashierReportAlert(
                level="warning",
                title="Remboursements fréquents",
                message=f"{refunded_count} annulations de paiement détectées.",
            )
        )
    mobile_share = sum(item.percentage for item in payment_breakdown if "Mobile" in item.method)
    if mobile_share >= 60:
        alerts.append(
            CashierReportAlert(
                level="info",
                title="Mobile Money dominant",
                message=f"Les paiements Mobile Money représentent {mobile_share:.1f}% des encaissements.",
            )
        )
    if total_collected <= 0:
        alerts.append(
            CashierReportAlert(
                level="info",
                title="Aucun encaissement",
                message="Aucune transaction payée sur la période sélectionnée.",
            )
        )
    if not alerts:
        alerts.append(
            CashierReportAlert(
                level="info",
                title="Situation stable",
                message="Aucune alerte majeure détectée sur la période analysée.",
            )
        )
    return alerts


def build_cashier_analytics(
    db: Session,
    restaurant_id: str,
    receipts: list[CustomerOrder],
    start: datetime,
    end: datetime,
) -> CashierReportAnalytics:
    total_collected = sum(float(order.total_amount or 0) for order in receipts)
    payment_breakdown = build_payment_breakdown(receipts)
    hourly_sales = build_hourly_sales(receipts)
    branch_performance = build_branch_performance(db, restaurant_id, receipts, start, end)
    cashier_performance = build_cashier_performance(db, restaurant_id, receipts, start, end)
    variance_history = build_variance_history(db, restaurant_id, start, end)

    refunded_count = len(variance_history)
    cancelled_count = (
        db.query(func.count(CustomerOrder.id))
        .filter(
            CustomerOrder.restaurant_id == restaurant_id,
            CustomerOrder.status.in_(CANCELLED_STATUSES),
            CustomerOrder.cancelled_at.isnot(None),
            CustomerOrder.cancelled_at >= start,
            CustomerOrder.cancelled_at <= end,
        )
        .scalar()
        or 0
    )

    now = end
    elapsed = now - start
    comparisons: dict[str, float | None] = {}
    for label, days in {"yesterday": 1, "last_week": 7, "last_month": 30}.items():
        comp_revenue, _ = _metrics_for_period(
            db,
            [restaurant_id],
            start - timedelta(days=days),
            start - timedelta(days=days) + elapsed,
        )
        comparisons[label] = _pct_change(total_collected, comp_revenue)

    refunded_amount = sum(abs(line.amount) for line in variance_history)
    theoretical_amount = round(total_collected + refunded_amount, 2)
    declared_amount = round(total_collected, 2)
    variance_amount = round(theoretical_amount - declared_amount, 2)

    return CashierReportAnalytics(
        restaurants_count=1,
        theoretical_amount=theoretical_amount,
        declared_amount=declared_amount,
        variance_amount=variance_amount,
        global_variance=variance_amount,
        payment_breakdown=payment_breakdown,
        branch_performance=branch_performance,
        cashier_performance=cashier_performance,
        hourly_sales=hourly_sales,
        cancelled_transactions=int(cancelled_count),
        refunded_transactions=refunded_count,
        variance_history=variance_history,
        comparisons=comparisons,
        alerts=build_alerts(
            total_collected=total_collected,
            comparisons=comparisons,
            cancelled_count=int(cancelled_count),
            refunded_count=refunded_count,
            payment_breakdown=payment_breakdown,
        ),
    )


def build_restaurant_performance_rows(
    db: Session,
    restaurants: list[Restaurant],
    start: datetime,
    end: datetime,
) -> list[CashierRestaurantPerformance]:
    elapsed = end - start
    rows: list[CashierRestaurantPerformance] = []
    for restaurant in restaurants:
        revenue, transactions = _metrics_for_period(db, [restaurant.id], start, end)
        comp_yesterday, _ = _metrics_for_period(db, [restaurant.id], start - timedelta(days=1), start - timedelta(days=1) + elapsed)
        comp_week, _ = _metrics_for_period(db, [restaurant.id], start - timedelta(days=7), start - timedelta(days=7) + elapsed)
        comp_month, _ = _metrics_for_period(db, [restaurant.id], start - timedelta(days=30), start - timedelta(days=30) + elapsed)
        rows.append(
            CashierRestaurantPerformance(
                restaurant_id=restaurant.id,
                restaurant_name=restaurant.name,
                revenue=round(revenue, 2),
                transactions=transactions,
                average_ticket=round(revenue / transactions, 2) if transactions else 0,
                comparison_yesterday=_pct_change(revenue, comp_yesterday),
                comparison_last_week=_pct_change(revenue, comp_week),
                comparison_last_month=_pct_change(revenue, comp_month),
            )
        )
    rows.sort(key=lambda item: item.revenue, reverse=True)
    for index, row in enumerate(rows, start=1):
        row.rank = index
    return rows


def build_network_analytics(
    db: Session,
    restaurant_ids: list[str],
    start: datetime,
    end: datetime,
) -> CashierReportAnalytics:
    receipts = _paid_orders_query(db, restaurant_ids, start, end).all()
    total_collected = sum(float(order.total_amount or 0) for order in receipts)
    payment_breakdown = build_payment_breakdown(receipts)
    hourly_sales = build_hourly_sales(receipts)
    restaurants = db.query(Restaurant).filter(Restaurant.id.in_(restaurant_ids)).all()
    restaurant_rows = build_restaurant_performance_rows(db, restaurants, start, end)

    elapsed = end - start
    comparisons: dict[str, float | None] = {}
    for label, days in {"yesterday": 1, "last_week": 7, "last_month": 30}.items():
        comp_revenue, _ = _metrics_for_period(
            db,
            restaurant_ids,
            start - timedelta(days=days),
            start - timedelta(days=days) + elapsed,
        )
        comparisons[label] = _pct_change(total_collected, comp_revenue)

    return CashierReportAnalytics(
        restaurants_count=len(restaurant_ids),
        theoretical_amount=round(total_collected, 2),
        declared_amount=round(total_collected, 2),
        variance_amount=0,
        global_variance=0,
        payment_breakdown=payment_breakdown,
        branch_performance=[],
        restaurant_performance=restaurant_rows,
        cashier_performance=[],
        hourly_sales=hourly_sales,
        cancelled_transactions=0,
        refunded_transactions=0,
        variance_history=[],
        comparisons=comparisons,
        alerts=build_alerts(
            total_collected=total_collected,
            comparisons=comparisons,
            cancelled_count=0,
            refunded_count=0,
            payment_breakdown=payment_breakdown,
        ),
    )
