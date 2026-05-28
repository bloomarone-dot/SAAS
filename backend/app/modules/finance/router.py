from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import assert_permission, require_tenant_user
from app.modules.finance.models import RestaurantExpense
from app.modules.finance.schemas import (
    DishMarginOut,
    ExpenseIn,
    ExpensePublic,
    ExpenseUpdateIn,
    FinanceSummaryOut,
    FinancialStatementOut,
    PaymentPublic,
    StockRotationOut,
)
from app.modules.orders.models import CustomerOrder, CustomerOrderItem
from app.modules.permissions.models import Permission
from app.modules.stock.models import StockDamage, StockItem, StockRecipeIngredient
from app.modules.users.models import User

router = APIRouter(prefix="/finance", tags=["finance"])


def report_range(start_date: datetime | None, end_date: datetime | None) -> tuple[datetime, datetime]:
    end = end_date or datetime.utcnow()
    start = start_date or (end - timedelta(days=7))
    return start, end


def order_filters(restaurant_id: str, start: datetime, end: datetime):
    return (
        CustomerOrder.restaurant_id == restaurant_id,
        CustomerOrder.created_at >= start,
        CustomerOrder.created_at <= end,
        CustomerOrder.status != "Annulée",
    )


def read_summary(db: Session, restaurant_id: str, start: datetime, end: datetime) -> FinanceSummaryOut:
    orders = db.query(CustomerOrder).filter(*order_filters(restaurant_id, start, end)).all()
    expenses = (
        db.query(func.coalesce(func.sum(RestaurantExpense.amount), 0))
        .filter(
            RestaurantExpense.restaurant_id == restaurant_id,
            RestaurantExpense.expense_date >= start,
            RestaurantExpense.expense_date <= end,
        )
        .scalar()
        or 0
    )
    damage_loss = (
        db.query(func.coalesce(func.sum(StockDamage.estimated_loss), 0))
        .filter(
            StockDamage.restaurant_id == restaurant_id,
            StockDamage.created_at >= start,
            StockDamage.created_at <= end,
        )
        .scalar()
        or 0
    )
    stock_items = db.query(StockItem).filter(StockItem.restaurant_id == restaurant_id).all()
    stock_value = sum((item.quantity + item.kitchen_quantity + item.drink_quantity) * item.purchase_price for item in stock_items)
    revenue = sum(order.total_amount for order in orders)
    paid_orders = [order for order in orders if order.status in {"Payée", "Payee"}]
    gross_profit = revenue - float(damage_loss or 0)
    net_profit = gross_profit - float(expenses or 0)
    return FinanceSummaryOut(
        start_date=start,
        end_date=end,
        revenue=revenue,
        expenses=float(expenses or 0),
        damage_loss=float(damage_loss or 0),
        stock_value=stock_value,
        gross_profit=gross_profit,
        net_profit=net_profit,
        orders_count=len(orders),
        paid_orders_count=len(paid_orders),
        average_order_value=(revenue / len(orders)) if orders else 0,
    )


@router.get("/expenses", response_model=list[ExpensePublic])
def list_expenses(
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_permission(current_user, Permission.ACCOUNTING_READ)
    start, end = report_range(start_date, end_date)
    return (
        db.query(RestaurantExpense)
        .filter(
            RestaurantExpense.restaurant_id == current_user.restaurant_id,
            RestaurantExpense.expense_date >= start,
            RestaurantExpense.expense_date <= end,
        )
        .order_by(RestaurantExpense.expense_date.desc())
        .all()
    )


@router.post("/expenses", response_model=ExpensePublic, status_code=201)
def create_expense(
    payload: ExpenseIn,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_permission(current_user, Permission.ACCOUNTING_UPDATE)
    expense = RestaurantExpense(
        restaurant_id=current_user.restaurant_id,
        label=payload.label,
        category=payload.category,
        amount=payload.amount,
        payment_method=payload.payment_method,
        reference=payload.reference,
        note=payload.note,
        expense_date=payload.expense_date or datetime.utcnow(),
        created_by_id=current_user.id,
    )
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return expense


@router.patch("/expenses/{expense_id}", response_model=ExpensePublic)
def update_expense(
    expense_id: str,
    payload: ExpenseUpdateIn,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_permission(current_user, Permission.ACCOUNTING_UPDATE)
    expense = db.get(RestaurantExpense, expense_id)
    if not expense or expense.restaurant_id != current_user.restaurant_id:
        raise HTTPException(status_code=404, detail="Depense introuvable")
    for field, value in payload.dict(exclude_unset=True).items():
        setattr(expense, field, value)
    db.commit()
    db.refresh(expense)
    return expense


@router.delete("/expenses/{expense_id}", status_code=204)
def delete_expense(
    expense_id: str,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_permission(current_user, Permission.ACCOUNTING_UPDATE)
    expense = db.get(RestaurantExpense, expense_id)
    if not expense or expense.restaurant_id != current_user.restaurant_id:
        raise HTTPException(status_code=404, detail="Depense introuvable")
    db.delete(expense)
    db.commit()
    return None


@router.get("/payments", response_model=list[PaymentPublic])
def list_payments(
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_permission(current_user, Permission.ACCOUNTING_READ)
    start, end = report_range(start_date, end_date)
    orders = (
        db.query(CustomerOrder)
        .filter(*order_filters(current_user.restaurant_id, start, end))
        .order_by(CustomerOrder.created_at.desc())
        .all()
    )
    return [
        PaymentPublic(
            id=order.id,
            order_number=order.order_number,
            customer_name=order.customer_name,
            payment_method=order.payment_method,
            amount=order.total_amount,
            status=order.status,
            created_at=order.created_at,
        )
        for order in orders
    ]


@router.get("/summary", response_model=FinanceSummaryOut)
def finance_summary(
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_permission(current_user, Permission.ACCOUNTING_READ)
    start, end = report_range(start_date, end_date)
    return read_summary(db, current_user.restaurant_id, start, end)


@router.get("/dish-margins", response_model=list[DishMarginOut])
def dish_margins(
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_permission(current_user, Permission.ACCOUNTING_READ)
    start, end = report_range(start_date, end_date)
    rows = (
        db.query(
            CustomerOrderItem.menu_item_id,
            CustomerOrderItem.name,
            func.coalesce(func.sum(CustomerOrderItem.quantity), 0),
            func.coalesce(func.sum(CustomerOrderItem.line_total), 0),
        )
        .join(CustomerOrder, CustomerOrder.id == CustomerOrderItem.order_id)
        .filter(*order_filters(current_user.restaurant_id, start, end))
        .group_by(CustomerOrderItem.menu_item_id, CustomerOrderItem.name)
        .all()
    )
    recipe_links = db.query(StockRecipeIngredient).filter(StockRecipeIngredient.restaurant_id == current_user.restaurant_id).all()
    stock_items = {item.id: item for item in db.query(StockItem).filter(StockItem.restaurant_id == current_user.restaurant_id).all()}
    cost_by_dish: dict[str, float] = {}
    for link in recipe_links:
        item = stock_items.get(link.stock_item_id)
        if not item:
            continue
        cost_by_dish[link.menu_item_id] = cost_by_dish.get(link.menu_item_id, 0) + link.quantity_per_dish * item.purchase_price
    output = []
    for menu_item_id, name, quantity, revenue in rows:
        unit_cost = cost_by_dish.get(menu_item_id or "", 0)
        estimated_cost = unit_cost * int(quantity or 0)
        margin = float(revenue or 0) - estimated_cost
        output.append(
            DishMarginOut(
                menu_item_id=menu_item_id,
                name=name,
                quantity_sold=int(quantity or 0),
                revenue=float(revenue or 0),
                estimated_cost=estimated_cost,
                estimated_margin=margin,
                margin_rate=(margin / float(revenue or 1)) * 100 if revenue else 0,
            )
        )
    return sorted(output, key=lambda item: item.estimated_margin, reverse=True)


@router.get("/stock-rotation", response_model=list[StockRotationOut])
def stock_rotation(
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_permission(current_user, Permission.STOCK_READ)
    start, end = report_range(start_date, end_date)
    rows = (
        db.query(
            CustomerOrderItem.menu_item_id,
            CustomerOrderItem.name,
            func.coalesce(func.sum(CustomerOrderItem.quantity), 0),
            func.coalesce(func.sum(CustomerOrderItem.line_total), 0),
            func.max(CustomerOrder.created_at),
        )
        .join(CustomerOrder, CustomerOrder.id == CustomerOrderItem.order_id)
        .filter(*order_filters(current_user.restaurant_id, start, end))
        .group_by(CustomerOrderItem.menu_item_id, CustomerOrderItem.name)
        .order_by(func.coalesce(func.sum(CustomerOrderItem.quantity), 0).desc())
        .all()
    )
    return [
        StockRotationOut(
            menu_item_id=menu_item_id,
            name=name,
            quantity_sold=int(quantity or 0),
            revenue=float(revenue or 0),
            last_order_at=last_order_at,
        )
        for menu_item_id, name, quantity, revenue, last_order_at in rows
    ]


@router.get("/statements", response_model=FinancialStatementOut)
def financial_statements(
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_permission(current_user, Permission.ACCOUNTING_READ)
    start, end = report_range(start_date, end_date)
    return FinancialStatementOut(
        report=read_summary(db, current_user.restaurant_id, start, end),
        margins=dish_margins(start, end, current_user, db),
        rotation=stock_rotation(start, end, current_user, db),
        expenses=list_expenses(start, end, current_user, db),
        payments=list_payments(start, end, current_user, db),
    )
