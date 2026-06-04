from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import assert_permission, require_tenant_user
from app.modules.finance.models import PromotionCode, RestaurantExpense
from app.modules.finance.schemas import (
    BalanceSheetOut,
    DishMarginOut,
    ExpenseIn,
    ExpensePublic,
    ExpenseUpdateIn,
    CashFlowStatementOut,
    IncomeStatementOut,
    LedgerEntryOut,
    FinanceSummaryOut,
    FinancialStatementOut,
    PaymentPublic,
    PromoQuoteIn,
    PromoQuoteOut,
    PromotionCodeIn,
    PromotionCodePublic,
    PromotionCodeUpdateIn,
    ServerRevenueOut,
    StockRotationOut,
)
from app.modules.orders.models import CustomerOrder, CustomerOrderItem
from app.modules.catalog.models import MenuItem
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
    stock_value = sum((item.quantity + item.kitchen_quantity + item.drink_quantity) * (item.cmup_current or item.purchase_price) for item in stock_items)
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


def normalize_promo_code(code: str) -> str:
    return code.strip().upper().replace(" ", "")


def calculate_promo_discount(promo: PromotionCode, order_amount: float) -> float:
    if promo.discount_type == "FIXED":
        amount = promo.discount_value
    else:
        amount = order_amount * promo.discount_value / 100
    if promo.max_discount_amount is not None:
        amount = min(amount, promo.max_discount_amount)
    return max(0, min(order_amount, amount))


def assert_promo_usable(promo: PromotionCode, order_amount: float) -> None:
    now = datetime.utcnow()
    if not promo.is_active:
        raise HTTPException(status_code=400, detail="Code promo inactif")
    if promo.starts_at and promo.starts_at > now:
        raise HTTPException(status_code=400, detail="Code promo pas encore actif")
    if promo.ends_at and promo.ends_at < now:
        raise HTTPException(status_code=400, detail="Code promo expire")
    if promo.max_uses is not None and promo.used_count >= promo.max_uses:
        raise HTTPException(status_code=400, detail="Code promo épuisé")
    if order_amount < promo.min_order_amount:
        raise HTTPException(status_code=400, detail=f"Montant minimum requis: {promo.min_order_amount}")


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
            RestaurantExpense.is_active.is_(True),
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
    expense.is_active = False
    db.commit()
    return None


@router.get("/promotions", response_model=list[PromotionCodePublic])
def list_promotions(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.CASHIER_READ)
    return (
        db.query(PromotionCode)
        .filter(PromotionCode.restaurant_id == current_user.restaurant_id)
        .order_by(PromotionCode.created_at.desc())
        .all()
    )


@router.post("/promotions", response_model=PromotionCodePublic, status_code=201)
def create_promotion(
    payload: PromotionCodeIn,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_permission(current_user, Permission.CASHIER_UPDATE)
    code = normalize_promo_code(payload.code)
    existing = (
        db.query(PromotionCode)
        .filter(PromotionCode.restaurant_id == current_user.restaurant_id, PromotionCode.code == code)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Ce code promo existe déjà")
    promo = PromotionCode(
        restaurant_id=current_user.restaurant_id,
        code=code,
        label=payload.label,
        discount_type=payload.discount_type,
        discount_value=payload.discount_value,
        min_order_amount=payload.min_order_amount,
        max_discount_amount=payload.max_discount_amount,
        max_uses=payload.max_uses,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        is_active=payload.is_active,
        created_by_id=current_user.id,
    )
    db.add(promo)
    db.commit()
    db.refresh(promo)
    return promo


@router.patch("/promotions/{promotion_id}", response_model=PromotionCodePublic)
def update_promotion(
    promotion_id: str,
    payload: PromotionCodeUpdateIn,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_permission(current_user, Permission.CASHIER_UPDATE)
    promo = db.get(PromotionCode, promotion_id)
    if not promo or promo.restaurant_id != current_user.restaurant_id:
        raise HTTPException(status_code=404, detail="Code promo introuvable")
    for field, value in payload.dict(exclude_unset=True).items():
        if field == "code" and value:
            value = normalize_promo_code(value)
            duplicate = (
                db.query(PromotionCode)
                .filter(
                    PromotionCode.restaurant_id == current_user.restaurant_id,
                    PromotionCode.code == value,
                    PromotionCode.id != promo.id,
                )
                .first()
            )
            if duplicate:
                raise HTTPException(status_code=400, detail="Ce code promo existe déjà")
        setattr(promo, field, value)
    db.commit()
    db.refresh(promo)
    return promo


@router.delete("/promotions/{promotion_id}", status_code=204)
def delete_promotion(
    promotion_id: str,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_permission(current_user, Permission.CASHIER_UPDATE)
    promo = db.get(PromotionCode, promotion_id)
    if not promo or promo.restaurant_id != current_user.restaurant_id:
        raise HTTPException(status_code=404, detail="Code promo introuvable")
    promo.is_active = False
    db.commit()
    return None


@router.post("/promotions/quote", response_model=PromoQuoteOut)
def quote_promotion(
    payload: PromoQuoteIn,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_permission(current_user, Permission.CASHIER_READ)
    promo = (
        db.query(PromotionCode)
        .filter(PromotionCode.restaurant_id == current_user.restaurant_id, PromotionCode.code == normalize_promo_code(payload.code))
        .first()
    )
    if not promo:
        raise HTTPException(status_code=404, detail="Code promo introuvable")
    assert_promo_usable(promo, payload.order_amount)
    discount = calculate_promo_discount(promo, payload.order_amount)
    return PromoQuoteOut(
        code=promo.code,
        label=promo.label,
        discount_amount=discount,
        final_amount=max(0, payload.order_amount - discount),
    )


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
<<<<<<< HEAD
            payment_status=getattr(order, "payment_status", "En attente"),
            transaction_id=getattr(order, "transaction_id", None),
=======
>>>>>>> 12ae8a7538e7247857354f2c0c441e94a0eb39cf
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
    manual_costs = {
        item.id: float(item.cost_per_dish or 0)
        for item in db.query(MenuItem.id, MenuItem.cost_per_dish)
        .filter(MenuItem.restaurant_id == current_user.restaurant_id, MenuItem.cost_per_dish > 0)
        .all()
    }
    recipe_links = db.query(StockRecipeIngredient).filter(StockRecipeIngredient.restaurant_id == current_user.restaurant_id).all()
    stock_items = {item.id: item for item in db.query(StockItem).filter(StockItem.restaurant_id == current_user.restaurant_id).all()}
    cost_by_dish: dict[str, float] = {}
    for link in recipe_links:
        item = stock_items.get(link.stock_item_id)
        if not item:
            continue
        cost_by_dish[link.menu_item_id] = cost_by_dish.get(link.menu_item_id, 0) + link.quantity_per_dish * (item.cmup_current or item.purchase_price)
    output = []
    for menu_item_id, name, quantity, revenue in rows:
        unit_cost = manual_costs.get(menu_item_id or "", cost_by_dish.get(menu_item_id or "", 0))
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


@router.get("/server-revenue", response_model=list[ServerRevenueOut])
def server_revenue(
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
        .all()
    )
    users = {
        user.id: user
        for user in db.query(User)
        .filter(User.restaurant_id == current_user.restaurant_id)
        .all()
    }
    grouped: dict[str | None, dict] = {}
    for order in orders:
        bucket = grouped.setdefault(
            order.server_id,
            {
                "orders_count": 0,
                "paid_orders_count": 0,
                "revenue": 0.0,
                "discounts": 0.0,
                "first_order_at": None,
                "last_order_at": None,
            },
        )
        bucket["orders_count"] += 1
        if order.status in {"Payée", "Payee"}:
            bucket["paid_orders_count"] += 1
            bucket["revenue"] += float(order.total_amount or 0)
        bucket["discounts"] += float(order.discount_amount or 0)
        bucket["first_order_at"] = min(filter(None, [bucket["first_order_at"], order.created_at]), default=order.created_at)
        bucket["last_order_at"] = max(filter(None, [bucket["last_order_at"], order.created_at]), default=order.created_at)
    output = []
    for server_id, data in grouped.items():
        user = users.get(server_id or "")
        output.append(
            ServerRevenueOut(
                server_id=server_id,
                server_name=f"{user.first_name} {user.last_name}".strip() if user else "Non assigné",
                orders_count=data["orders_count"],
                paid_orders_count=data["paid_orders_count"],
                revenue=data["revenue"],
                discounts=data["discounts"],
                average_ticket=(data["revenue"] / data["paid_orders_count"]) if data["paid_orders_count"] else 0,
                first_order_at=data["first_order_at"],
                last_order_at=data["last_order_at"],
            )
        )
    return sorted(output, key=lambda row: row.revenue, reverse=True)


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
    report = read_summary(db, current_user.restaurant_id, start, end)
    payments = list_payments(start, end, current_user, db)
    expenses = list_expenses(start, end, current_user, db)
    discounts = (
        db.query(func.coalesce(func.sum(CustomerOrder.discount_amount), 0))
        .filter(*order_filters(current_user.restaurant_id, start, end))
        .scalar()
        or 0
    )
    by_payment_method: dict[str, float] = {}
    for payment in payments:
        if payment.status not in {"Payée", "Payee"}:
            continue
        by_payment_method[payment.payment_method] = by_payment_method.get(payment.payment_method, 0) + payment.amount
    cash_in = sum(by_payment_method.values())
    cash_out = sum(expense.amount for expense in expenses)
    ledger = [
        LedgerEntryOut(
            date=payment.created_at,
            account="Ventes",
            label=f"Commande {payment.order_number}",
            debit=0,
            credit=payment.amount,
            reference=payment.id,
        )
        for payment in payments
        if payment.status in {"Payée", "Payee"}
    ]
    ledger.extend(
        LedgerEntryOut(
            date=expense.expense_date,
            account=expense.category,
            label=expense.label,
            debit=expense.amount,
            credit=0,
            reference=expense.reference,
        )
        for expense in expenses
    )
    ledger.sort(key=lambda entry: entry.date, reverse=True)
    return FinancialStatementOut(
        report=report,
        income_statement=IncomeStatementOut(
            revenue=report.revenue + float(discounts or 0),
            discounts=float(discounts or 0),
            net_revenue=report.revenue,
            expenses=report.expenses,
            damage_loss=report.damage_loss,
            gross_profit=report.gross_profit,
            net_profit=report.net_profit,
        ),
        cash_flow=CashFlowStatementOut(
            cash_in=cash_in,
            cash_out=cash_out,
            net_cash_flow=cash_in - cash_out,
            by_payment_method=by_payment_method,
        ),
        balance_sheet=BalanceSheetOut(
            assets={"stock": report.stock_value, "cash_period": cash_in},
            liabilities={"expenses_period": cash_out},
            equity={"estimated_result": report.net_profit},
        ),
        ledger=ledger,
        margins=dish_margins(start, end, current_user, db),
        rotation=stock_rotation(start, end, current_user, db),
        expenses=expenses,
        payments=payments,
<<<<<<< HEAD
    )
=======
    )
>>>>>>> 12ae8a7538e7247857354f2c0c441e94a0eb39cf
