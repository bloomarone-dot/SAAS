from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session

from app.modules.finance.models import Expense, ExpenseCategory, OperationStatus
from app.modules.shared.models import utcnow
from app.modules.stock.models import Product, StockCategory, StockMovement, StockMovementStatus, StockMovementType

PURCHASE_TYPES = {
    StockMovementType.ENTRY,
    StockMovementType.DIRECT_ENTRY,
}

PERIOD_LABELS = {
    "today": ("Aujourd'hui", "Hier"),
    "yesterday": ("Hier", "Avant-hier"),
    "week": ("7 derniers jours", "7 jours précédents"),
    "month": ("Ce mois", "Période précédente"),
    "year": ("Cette année", "Période précédente"),
    "custom": ("Période sélectionnée", "Période précédente"),
}


def money(value) -> float:
    return float(Decimal(str(value or 0)).quantize(Decimal("0.01")))


def variation_pct(current: float, previous: float) -> float | None:
    if not previous:
        return None
    return round((current - previous) / previous * 100, 1)


def analytics_period_bounds(
    period: str,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> tuple[datetime, datetime]:
    now = utcnow()
    if start_date and end_date:
        return start_date, end_date
    if period == "today":
        return datetime.combine(now.date(), datetime.min.time()), now
    if period == "yesterday":
        day = now.date() - timedelta(days=1)
        return datetime.combine(day, datetime.min.time()), datetime.combine(day, datetime.max.time())
    if period == "month":
        return datetime(now.year, now.month, 1), now
    if period == "year":
        return datetime(now.year, 1, 1), now
    start_day = now.date() - timedelta(days=6)
    return datetime.combine(start_day, datetime.min.time()), now


def previous_period_bounds(start: datetime, end: datetime) -> tuple[datetime, datetime]:
    duration = end - start
    previous_end = start - timedelta(microseconds=1)
    return start - duration, previous_end


def movement_amount(movement: StockMovement) -> Decimal:
    if movement.total_amount is not None:
        return Decimal(str(movement.total_amount or 0))
    if movement.unit_price is not None:
        return Decimal(str(movement.unit_price or 0)) * Decimal(str(movement.quantity or 0))
    return Decimal(str(movement.value_legacy or 0))


def expense_rows(db: Session, restaurant_id: str, start: datetime, end: datetime) -> list[Expense]:
    return (
        db.query(Expense)
        .filter(
            Expense.restaurant_id == restaurant_id,
            Expense.expense_date >= start,
            Expense.expense_date <= end,
            Expense.status != OperationStatus.CANCELLED,
        )
        .all()
    )


def purchase_rows(db: Session, restaurant_id: str, start: datetime, end: datetime) -> list[StockMovement]:
    return (
        db.query(StockMovement)
        .filter(
            StockMovement.restaurant_id == restaurant_id,
            StockMovement.movement_date >= start,
            StockMovement.movement_date <= end,
            StockMovement.movement_type.in_(tuple(PURCHASE_TYPES)),
            StockMovement.status != StockMovementStatus.CANCELLED,
        )
        .all()
    )


def sum_expenses(rows: list[Expense]) -> float:
    return money(sum((row.total_amount for row in rows), Decimal("0")))


def sum_purchases(rows: list[StockMovement]) -> float:
    return money(sum((movement_amount(row) for row in rows), Decimal("0")))


def category_breakdown(
    db: Session,
    restaurant_id: str,
    current_expenses: list[Expense],
    previous_expenses: list[Expense],
    current_purchases: list[StockMovement],
    previous_purchases: list[StockMovement],
) -> list[dict]:
    categories = {
        category.id: category.name
        for category in db.query(ExpenseCategory)
        .filter(ExpenseCategory.restaurant_id == restaurant_id)
        .all()
    }
    product_categories = {
        category.id: category.name
        for category in db.query(StockCategory)
        .filter(StockCategory.restaurant_id == restaurant_id)
        .all()
    }
    products = {
        product.id: product.category_id
        for product in db.query(Product)
        .filter(Product.restaurant_id == restaurant_id)
        .all()
    }

    buckets: dict[str, dict] = {}

    def bucket_for(key: str, label: str) -> dict:
        return buckets.setdefault(
            key,
            {"key": key, "label": label, "current": 0.0, "previous": 0.0, "variation_pct": None, "share_pct": 0.0},
        )

    for expense in current_expenses:
        label = categories.get(expense.category_id) if expense.category_id else "Dépenses sans catégorie"
        key = f"expense:{expense.category_id or 'none'}"
        bucket_for(key, label)["current"] += money(expense.total_amount)

    for expense in previous_expenses:
        label = categories.get(expense.category_id) if expense.category_id else "Dépenses sans catégorie"
        key = f"expense:{expense.category_id or 'none'}"
        bucket_for(key, label)["previous"] += money(expense.total_amount)

    for movement in current_purchases:
        category_id = products.get(movement.product_id)
        label = product_categories.get(category_id) if category_id else "Achats stock (autres)"
        key = f"stock:{category_id or 'none'}"
        bucket = bucket_for(key, f"Achat — {label}")
        bucket["current"] += money(movement_amount(movement))

    for movement in previous_purchases:
        category_id = products.get(movement.product_id)
        label = product_categories.get(category_id) if category_id else "Achats stock (autres)"
        key = f"stock:{category_id or 'none'}"
        bucket = bucket_for(key, f"Achat — {label}")
        bucket["previous"] += money(movement_amount(movement))

    rows = list(buckets.values())
    total_current = sum(row["current"] for row in rows)
    for row in rows:
        row["variation_pct"] = variation_pct(row["current"], row["previous"])
        row["share_pct"] = round((row["current"] / total_current * 100), 1) if total_current else 0.0
    rows.sort(key=lambda row: row["current"], reverse=True)
    return rows


def timeline_buckets(period: str, start: datetime, end: datetime) -> list[tuple[datetime, datetime, str]]:
    if period in {"today", "yesterday"}:
        return [(start, end, start.strftime("%d/%m/%Y"))]
    if period == "year":
        buckets: list[tuple[datetime, datetime, str]] = []
        cursor = datetime(start.year, start.month, 1)
        while cursor <= end:
            if cursor.month == 12:
                next_month = datetime(cursor.year + 1, 1, 1)
            else:
                next_month = datetime(cursor.year, cursor.month + 1, 1)
            bucket_end = min(next_month - timedelta(microseconds=1), end)
            buckets.append((cursor, bucket_end, cursor.strftime("%b %Y")))
            cursor = next_month
        return buckets
    buckets = []
    cursor = datetime.combine(start.date(), datetime.min.time())
    end_day = datetime.combine(end.date(), datetime.max.time())
    while cursor <= end_day:
        bucket_end = datetime.combine(cursor.date(), datetime.max.time())
        buckets.append((cursor, min(bucket_end, end), cursor.strftime("%d/%m")))
        cursor += timedelta(days=1)
    return buckets


def build_timeline(
    period: str,
    start: datetime,
    end: datetime,
    current_expenses: list[Expense],
    current_purchases: list[StockMovement],
) -> list[dict]:
    rows = []
    for bucket_start, bucket_end, label in timeline_buckets(period, start, end):
        expense_total = sum(
            money(expense.total_amount)
            for expense in current_expenses
            if bucket_start <= expense.expense_date <= bucket_end
        )
        purchase_total = sum(
            money(movement_amount(movement))
            for movement in current_purchases
            if bucket_start <= movement.movement_date <= bucket_end
        )
        rows.append(
            {
                "label": label,
                "restaurant_expenses": expense_total,
                "stock_purchases": purchase_total,
                "total": round(expense_total + purchase_total, 2),
            }
        )
    return rows


def build_spending_analytics(
    db: Session,
    restaurant_id: str,
    period: str = "month",
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> dict:
    start, end = analytics_period_bounds(period, start_date, end_date)
    prev_start, prev_end = previous_period_bounds(start, end)

    current_expenses = expense_rows(db, restaurant_id, start, end)
    previous_expenses = expense_rows(db, restaurant_id, prev_start, prev_end)
    current_purchases = purchase_rows(db, restaurant_id, start, end)
    previous_purchases = purchase_rows(db, restaurant_id, prev_start, prev_end)

    current_expense_total = sum_expenses(current_expenses)
    previous_expense_total = sum_expenses(previous_expenses)
    current_purchase_total = sum_purchases(current_purchases)
    previous_purchase_total = sum_purchases(previous_purchases)
    current_total = round(current_expense_total + current_purchase_total, 2)
    previous_total = round(previous_expense_total + previous_purchase_total, 2)

    current_labels = PERIOD_LABELS.get(period if not (start_date and end_date) else "custom", PERIOD_LABELS["custom"])

    return {
        "period": period if not (start_date and end_date) else "custom",
        "current_period": {
            "start": start.isoformat(),
            "end": end.isoformat(),
            "label": current_labels[0],
        },
        "previous_period": {
            "start": prev_start.isoformat(),
            "end": prev_end.isoformat(),
            "label": current_labels[1],
        },
        "totals": {
            "restaurant_expenses": current_expense_total,
            "stock_purchases": current_purchase_total,
            "all_spending": current_total,
            "previous_restaurant_expenses": previous_expense_total,
            "previous_stock_purchases": previous_purchase_total,
            "previous_all_spending": previous_total,
            "all_spending_variation_pct": variation_pct(current_total, previous_total),
            "restaurant_expenses_variation_pct": variation_pct(current_expense_total, previous_expense_total),
            "stock_purchases_variation_pct": variation_pct(current_purchase_total, previous_purchase_total),
            "difference_amount": round(current_total - previous_total, 2),
        },
        "by_source": [
            {
                "key": "restaurant_expenses",
                "label": "Dépenses restaurant",
                "current": current_expense_total,
                "previous": previous_expense_total,
                "variation_pct": variation_pct(current_expense_total, previous_expense_total),
            },
            {
                "key": "stock_purchases",
                "label": "Achats stock / marchandises",
                "current": current_purchase_total,
                "previous": previous_purchase_total,
                "variation_pct": variation_pct(current_purchase_total, previous_purchase_total),
            },
        ],
        "by_category": category_breakdown(
            db,
            restaurant_id,
            current_expenses,
            previous_expenses,
            current_purchases,
            previous_purchases,
        ),
        "timeline": build_timeline(period if not (start_date and end_date) else "month", start, end, current_expenses, current_purchases),
    }
