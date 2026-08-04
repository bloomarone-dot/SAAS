from datetime import datetime
from app.modules.shared.models import utcnow
from datetime import time
from decimal import Decimal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, and_
from sqlalchemy.orm import Session, selectinload
from app.database import get_db
from app.dependencies import has_permission, require_tenant_user
from app.rate_limits import public_order_rate_limit
from app.modules.orders.cashier_analytics import build_cashier_analytics, build_network_analytics
from app.modules.audit.service import log_action
from app.modules.catalog.classification import classify_menu_item, requires_kitchen_preparation
from app.modules.catalog.models import MenuCategory, MenuItem
from app.modules.branches.models import DeliveryArea
from app.modules.finance.models import CashRegister, PromotionCode
from app.modules.kitchen.models import KitchenStatus, KitchenTicketModel
from app.modules.kitchen.router import mark_order_kitchen_tickets_served
from app.modules.orders.models import CashDrawerSession, CustomerOrder, CustomerOrderItem
from app.modules.notifications.service import notify
from app.modules.orders.schemas import (
    CashDrawerCloseIn,
    CashDrawerOpenIn,
    CashDrawerSessionOut,
    CashierDeliveryCreateIn,
    CashierDiscountLine,
    CashierNetworkReportOut,
    CashierPaymentIn,
    CashierReportOut,
    OrderCashAssignmentIn,
    OrderDeleteIn,
    OrderPublic,
    OrderReopenIn,
    OrderStatusUpdateIn,
    OrderUpdateIn,
    PromoApplyIn,
    PublicOrderCreateIn,
)
from app.modules.permissions.models import Permission, Role
from app.modules.realtime.manager import emit_restaurant_event
from app.modules.restaurants.models import Restaurant
from app.modules.stock.models import StockMovement, StockMovementType, StockRecipeIngredient
from app.modules.stock.models import StockItem, StockItemPackaging, StockLocation
from app.modules.stock.router import consume_fifo, dec, get_item_or_404, get_location_quantity, set_location_quantity
from app.modules.tables.models import TableModel, TableStatus
from app.modules.users.models import User


router = APIRouter(prefix="/orders", tags=["orders"])
ALLOWED_STATUSES = {"Nouvelle", "Acceptée", "En préparation", "Prête", "Livrée", "Payée", "Annulée", "Archivée", "PENDING_PAYMENT"}
PAID_STATUSES = {"Payée", "Payee"}
EXCLUDED_ACTIVE_STATUSES = {"Annulée", "Annulee", "Archivée", "Archivee"}
PAYABLE_STATUSES = {"Prête", "Livrée"}
CASHIER_PENDING_STATUSES = PAYABLE_STATUSES | {"PENDING_PAYMENT"}


@router.post("/public/{slug}", response_model=OrderPublic, status_code=status.HTTP_201_CREATED)
@public_order_rate_limit
def create_public_order(slug: str, payload: PublicOrderCreateIn, request: Request, db: Session = Depends(get_db)):
    # Aligné sur le menu public / résolution tenant (slug, subdomain, slug sans tirets).
    tenant_key = slug.strip().lower()
    restaurant = (
        db.query(Restaurant)
        .filter(
            Restaurant.is_active.is_(True),
            or_(
                func.lower(Restaurant.slug) == tenant_key,
                func.lower(Restaurant.subdomain) == tenant_key,
                func.replace(func.lower(Restaurant.slug), "-", "") == tenant_key,
            ),
        )
        .one_or_none()
    )
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant indisponible")
    if not restaurant.is_open:
        raise HTTPException(status_code=400, detail="Le restaurant est actuellement ferme")

    quantities = {item.menu_item_id: item.quantity for item in payload.items}
    dishes = (
        db.query(MenuItem)
        .options(selectinload(MenuItem.category))
        .filter(
            MenuItem.restaurant_id == restaurant.id,
            MenuItem.id.in_(list(quantities.keys())),
            MenuItem.is_available.is_(True),
        )
        .all()
    )
    if len(dishes) != len(quantities):
        raise HTTPException(status_code=400, detail="Un ou plusieurs plats ne sont plus disponibles")

    delivery_area = None
    delivery_fee = 0
    if payload.fulfillment_type == "Livraison":
        delivery_area = resolve_delivery_area(db, restaurant.id, payload.delivery_area_id)
        delivery_fee = float(delivery_area.delivery_fee if delivery_area else restaurant.delivery_fee or 0)

    order = CustomerOrder(
        restaurant_id=restaurant.id,
        branch_id=None,
        order_number=make_order_number(restaurant.slug),
        customer_name=payload.customer_name.strip(),
        customer_phone=payload.customer_phone.strip(),
        customer_address=payload.customer_address,
        notes=payload.notes,
        fulfillment_type=payload.fulfillment_type,
        payment_method=payload.payment_method,
        delivery_area_id=delivery_area.id if delivery_area else None,
        delivery_fee=delivery_fee,
    )
    total = 0.0
    for dish in dishes:
        quantity = quantities[dish.id]
        line_total = float(dish.price) * quantity
        total += line_total
        order.items.append(
            CustomerOrderItem(
                menu_item_id=dish.id,
                name=dish.name,
                sale_channel=classify_menu_item(dish),
                quantity=quantity,
                unit_price=float(dish.price),
                line_total=line_total,
            )
        )
        consume_recipe_stock(db, restaurant.id, dish, quantity)
    recalculate_order_total(order)
    db.add(order)
    assign_order_to_cash_register(db, order, rule="AUTO")
    db.commit()
    db.refresh(order)
    return get_order_or_404(db, order.id, restaurant.id)


@router.post("/cashier-delivery", response_model=OrderPublic, status_code=status.HTTP_201_CREATED)
def create_cashier_delivery(
    payload: CashierDeliveryCreateIn,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_can_update_cashier(current_user)
    restaurant = db.get(Restaurant, current_user.restaurant_id)
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant introuvable")

    delivery_area = resolve_delivery_area(db, current_user.restaurant_id, payload.delivery_area_id)
    if not delivery_area:
        raise HTTPException(status_code=400, detail="Quartier de livraison invalide")

    quantities = {item.menu_item_id: item.quantity for item in payload.items}
    dishes = (
        db.query(MenuItem)
        .options(selectinload(MenuItem.category))
        .filter(
            MenuItem.restaurant_id == current_user.restaurant_id,
            MenuItem.id.in_(list(quantities.keys())),
            MenuItem.is_available.is_(True),
        )
        .all()
    )
    if len(dishes) != len(quantities):
        raise HTTPException(status_code=400, detail="Un ou plusieurs plats ne sont plus disponibles")

    delivery_fee = float(delivery_area.delivery_fee or restaurant.delivery_fee or 0)
    order = CustomerOrder(
        restaurant_id=current_user.restaurant_id,
        branch_id=current_user.branch_id or delivery_area.branch_id,
        cashier_id=current_user.id,
        created_by_cashier_id=current_user.id,
        order_number=make_order_number(restaurant.slug),
        customer_name=payload.customer_name.strip(),
        customer_phone=payload.customer_phone.strip(),
        customer_address=payload.customer_address,
        notes=payload.notes,
        fulfillment_type="Livraison",
        payment_method=payload.payment_method,
        delivery_area_id=delivery_area.id,
        delivery_fee=delivery_fee,
        status="Nouvelle",
    )
    for dish in dishes:
        quantity = quantities[dish.id]
        line_total = float(dish.price) * quantity
        order.items.append(
            CustomerOrderItem(
                menu_item_id=dish.id,
                name=dish.name,
                sale_channel=classify_menu_item(dish),
                quantity=quantity,
                unit_price=float(dish.price),
                line_total=line_total,
            )
        )
        consume_recipe_stock(db, current_user.restaurant_id, dish, quantity)
    recalculate_order_total(order)
    db.add(order)
    assign_order_to_cash_register(db, order, rule="AUTO")
    log_action(
        db,
        current_user,
        "order.cashier_delivery",
        "order",
        order.id,
        f"Livraison caisse {order.order_number}",
        {
            "customer_phone": order.customer_phone,
            "delivery_area_id": order.delivery_area_id,
            "payment_method": order.payment_method,
        },
    )
    db.commit()
    db.refresh(order)
    return get_order_or_404(db, order.id, current_user.restaurant_id)


@router.get("", response_model=list[OrderPublic])
def list_orders(
    status_filter: str | None = Query(default=None, alias="status"),
    server_id: str | None = Query(default=None),
    fulfillment_type: str | None = Query(default=None),
    limit: int = Query(default=150, ge=1, le=500),
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_can_read_orders(current_user)
    query = (
        db.query(CustomerOrder)
        .options(selectinload(CustomerOrder.items))
        .filter(CustomerOrder.restaurant_id == current_user.restaurant_id)
        .filter(CustomerOrder.deleted_at.is_(None))
    )
    if not status_filter:
        query = query.filter(~CustomerOrder.status.in_(EXCLUDED_ACTIVE_STATUSES))
    if status_filter:
        query = query.filter(CustomerOrder.status == status_filter)
    if fulfillment_type:
        query = query.filter(CustomerOrder.fulfillment_type == fulfillment_type)
    if server_id:
        query = query.filter(CustomerOrder.server_id == server_id)
    if current_user.role == Role.CAISSE:
        query = apply_cashier_order_visibility_scope(query, current_user)
    orders = query.order_by(CustomerOrder.created_at.desc()).limit(limit).all()
    enrich_orders(db, orders)
    return orders


@router.get("/cashier-report", response_model=CashierReportOut)
def cashier_report(
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_can_read_cashier(current_user)
    start, end = cashier_period(start_date, end_date)
    base_query = (
        db.query(CustomerOrder)
        .options(selectinload(CustomerOrder.items))
        .filter(CustomerOrder.restaurant_id == current_user.restaurant_id)
        .filter(CustomerOrder.deleted_at.is_(None))
        .filter(~CustomerOrder.status.in_(EXCLUDED_ACTIVE_STATUSES))
    )
    pending_query = apply_cashier_pending_scope(
        base_query.filter(CustomerOrder.status.in_(CASHIER_PENDING_STATUSES)),
        current_user,
    )
    pending_orders = pending_query.order_by(CustomerOrder.created_at.asc()).all()
    receipts_query = apply_cashier_receipts_scope(
        base_query.filter(CustomerOrder.status.in_(PAID_STATUSES))
        .filter(func.coalesce(CustomerOrder.paid_at, CustomerOrder.updated_at) >= start)
        .filter(func.coalesce(CustomerOrder.paid_at, CustomerOrder.updated_at) <= end),
        current_user,
    )
    receipts = receipts_query.order_by(
        func.coalesce(CustomerOrder.paid_at, CustomerOrder.updated_at).desc()
    ).all()
    total_collected = sum(float(order.total_amount or 0) for order in receipts)
    discount_lines: list[CashierDiscountLine] = []
    total_discounts = 0.0
    by_payment_method: dict[str, float] = {}
    for order in receipts:
        method = order.payment_method or "Non renseigné"
        by_payment_method[method] = by_payment_method.get(method, 0) + float(order.total_amount or 0)
        discount_value = float(order.discount_amount or 0)
        if discount_value > 0:
            total_discounts += discount_value
    enrich_orders(db, pending_orders + receipts)
    for order in receipts:
        discount_value = float(order.discount_amount or 0)
        if discount_value <= 0:
            continue
        discount_lines.append(
            CashierDiscountLine(
                order_id=order.id,
                order_number=order.order_number,
                discount_amount=discount_value,
                total_amount=float(order.total_amount or 0),
                server_name=getattr(order, "server_name", None) if order.table_id else None,
                cashier_name=(
                    getattr(order, "created_by_cashier_name", None)
                    or getattr(order, "cashier_name", None)
                    if order.fulfillment_type == "Livraison"
                    else getattr(order, "cashier_name", None)
                ),
                paid_at=order.paid_at or order.updated_at,
            )
        )
    discount_lines.sort(key=lambda line: line.paid_at or datetime.min, reverse=True)
    analytics = build_cashier_analytics(db, current_user.restaurant_id, receipts, start, end)
    return CashierReportOut(
        start_date=start,
        end_date=end,
        pending_orders_count=len(pending_orders),
        paid_orders_count=len(receipts),
        receipts_count=len(receipts),
        total_collected=total_collected,
        total_discounts=round(total_discounts, 2),
        discounted_orders_count=len(discount_lines),
        discount_lines=discount_lines,
        average_ticket=(total_collected / len(receipts)) if receipts else 0,
        by_payment_method=by_payment_method,
        pending_orders=pending_orders,
        receipts=receipts,
        analytics=analytics,
    )


def _is_cash_method(method: str | None) -> bool:
    value = (method or "").strip().lower()
    return value in {"espèces", "especes", "cash", "liquide"}


def _is_mobile_method(method: str | None) -> bool:
    value = (method or "").strip().lower()
    return "orange" in value or "mtn" in value or "mobile" in value


def _is_card_method(method: str | None) -> bool:
    value = (method or "").strip().lower()
    return "carte" in value or "card" in value


def build_cash_drawer_session_out(
    db: Session,
    restaurant_id: str,
    session: CashDrawerSession | None,
    business_date,
) -> CashDrawerSessionOut:
    start = datetime.combine(business_date, time.min)
    end = datetime.combine(business_date, time.max)
    receipts = (
        db.query(CustomerOrder)
        .filter(
            CustomerOrder.restaurant_id == restaurant_id,
            CustomerOrder.deleted_at.is_(None),
            CustomerOrder.status.in_(PAID_STATUSES),
            func.coalesce(CustomerOrder.paid_at, CustomerOrder.updated_at) >= start,
            func.coalesce(CustomerOrder.paid_at, CustomerOrder.updated_at) <= end,
        )
        .all()
    )
    sales_total = 0.0
    cash_sales = 0.0
    mobile_sales = 0.0
    card_sales = 0.0
    for order in receipts:
        amount = float(order.total_amount or 0)
        sales_total += amount
        method = order.payment_method
        if _is_cash_method(method):
            cash_sales += amount
        elif _is_mobile_method(method):
            mobile_sales += amount
        elif _is_card_method(method):
            card_sales += amount

    opening_float = float(session.opening_float) if session else 0.0
    closing_counted = float(session.closing_counted) if session and session.closing_counted is not None else None
    expected_in_drawer = round(opening_float + cash_sales, 2)
    expected_day_total = round(opening_float + sales_total, 2)
    variance = round(closing_counted - expected_in_drawer, 2) if closing_counted is not None else None

    user_ids = set()
    if session:
        user_ids.add(session.opened_by_id)
        if session.closed_by_id:
            user_ids.add(session.closed_by_id)
    users = {
        user.id: ((f"{user.first_name or ''} {user.last_name or ''}".strip()) or user.username)
        for user in db.query(User).filter(User.id.in_(list(user_ids))).all()
    } if user_ids else {}

    return CashDrawerSessionOut(
        id=session.id if session else None,
        business_date=business_date,
        status=session.status if session else "NONE",
        opening_float=opening_float,
        closing_counted=closing_counted,
        opening_notes=session.opening_notes if session else None,
        closing_notes=session.closing_notes if session else None,
        opened_at=session.opened_at if session else None,
        closed_at=session.closed_at if session else None,
        opened_by_name=users.get(session.opened_by_id) if session else None,
        closed_by_name=users.get(session.closed_by_id) if session and session.closed_by_id else None,
        sales_total=round(sales_total, 2),
        cash_sales=round(cash_sales, 2),
        mobile_sales=round(mobile_sales, 2),
        card_sales=round(card_sales, 2),
        expected_in_drawer=expected_in_drawer,
        expected_day_total=expected_day_total,
        variance=variance,
        paid_orders_count=len(receipts),
    )


@router.get("/cash-session", response_model=CashDrawerSessionOut)
def get_cash_session(
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_can_read_cashier(current_user)
    business_date = utcnow().date()
    session = (
        db.query(CashDrawerSession)
        .filter(
            CashDrawerSession.restaurant_id == current_user.restaurant_id,
            CashDrawerSession.business_date == business_date,
        )
        .order_by(CashDrawerSession.opened_at.desc())
        .first()
    )
    return build_cash_drawer_session_out(db, current_user.restaurant_id, session, business_date)


@router.post("/cash-session/open", response_model=CashDrawerSessionOut)
def open_cash_session(
    payload: CashDrawerOpenIn,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_can_collect_cashier(current_user)
    business_date = utcnow().date()
    existing = (
        db.query(CashDrawerSession)
        .filter(
            CashDrawerSession.restaurant_id == current_user.restaurant_id,
            CashDrawerSession.business_date == business_date,
            CashDrawerSession.status == "OPEN",
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Une session de caisse est déjà ouverte pour aujourd'hui.")

    closed_today = (
        db.query(CashDrawerSession)
        .filter(
            CashDrawerSession.restaurant_id == current_user.restaurant_id,
            CashDrawerSession.business_date == business_date,
            CashDrawerSession.status == "CLOSED",
        )
        .first()
    )
    if closed_today:
        raise HTTPException(status_code=409, detail="La caisse du jour est déjà clôturée.")

    session = CashDrawerSession(
        restaurant_id=current_user.restaurant_id,
        business_date=business_date,
        opened_by_id=current_user.id,
        opening_float=Decimal(str(round(float(payload.opening_float), 0))),
        opening_notes=(payload.notes or "").strip() or None,
        status="OPEN",
    )
    db.add(session)
    log_action(
        db,
        current_user,
        "cashier.session_open",
        "cash_drawer_session",
        session.id,
        f"Ouverture caisse fond {session.opening_float} FCFA",
        {"opening_float": float(session.opening_float)},
    )
    db.commit()
    db.refresh(session)
    return build_cash_drawer_session_out(db, current_user.restaurant_id, session, business_date)


@router.post("/cash-session/close", response_model=CashDrawerSessionOut)
def close_cash_session(
    payload: CashDrawerCloseIn,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_can_collect_cashier(current_user)
    business_date = utcnow().date()
    session = (
        db.query(CashDrawerSession)
        .filter(
            CashDrawerSession.restaurant_id == current_user.restaurant_id,
            CashDrawerSession.business_date == business_date,
            CashDrawerSession.status == "OPEN",
        )
        .order_by(CashDrawerSession.opened_at.desc())
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Aucune session de caisse ouverte à clôturer.")

    session.closing_counted = Decimal(str(round(float(payload.closing_counted), 0)))
    session.closing_notes = (payload.notes or "").strip() or None
    session.closed_by_id = current_user.id
    session.closed_at = utcnow()
    session.status = "CLOSED"
    summary = build_cash_drawer_session_out(db, current_user.restaurant_id, session, business_date)
    log_action(
        db,
        current_user,
        "cashier.session_close",
        "cash_drawer_session",
        session.id,
        f"Clôture caisse compté {session.closing_counted} FCFA (écart {summary.variance})",
        {
            "closing_counted": float(session.closing_counted),
            "expected_in_drawer": summary.expected_in_drawer,
            "variance": summary.variance,
            "sales_total": summary.sales_total,
        },
    )
    db.commit()
    db.refresh(session)
    return build_cash_drawer_session_out(db, current_user.restaurant_id, session, business_date)


@router.get("/cashier-network-report", response_model=CashierNetworkReportOut)
def cashier_network_report(
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    if current_user.role != Role.SUPERADMIN:
        raise HTTPException(status_code=403, detail="Rapport réseau réservé au super administrateur")
    start, end = cashier_period(start_date, end_date)
    restaurants = db.query(Restaurant).filter(Restaurant.is_active.is_(True)).all()
    restaurant_ids = [restaurant.id for restaurant in restaurants]
    receipts = (
        db.query(CustomerOrder)
        .filter(
            CustomerOrder.restaurant_id.in_(restaurant_ids),
            CustomerOrder.deleted_at.is_(None),
            CustomerOrder.status.in_(PAID_STATUSES),
            func.coalesce(CustomerOrder.paid_at, CustomerOrder.updated_at) >= start,
            func.coalesce(CustomerOrder.paid_at, CustomerOrder.updated_at) <= end,
        )
        .all()
        if restaurant_ids
        else []
    )
    total_collected = sum(float(order.total_amount or 0) for order in receipts)
    analytics = build_network_analytics(db, restaurant_ids, start, end)
    return CashierNetworkReportOut(
        start_date=start,
        end_date=end,
        total_collected=total_collected,
        paid_orders_count=len(receipts),
        average_ticket=(total_collected / len(receipts)) if receipts else 0,
        analytics=analytics,
    )


@router.get("/payments/completed", response_model=list[OrderPublic])
def completed_payments(
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    payment_method: str | None = Query(default=None),
    cashier_id: str | None = Query(default=None),
    branch_id: str | None = Query(default=None),
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_can_read_cashier(current_user)
    start, end = cashier_period(start_date, end_date)
    query = (
        db.query(CustomerOrder)
        .options(selectinload(CustomerOrder.items))
        .filter(
            CustomerOrder.restaurant_id == current_user.restaurant_id,
            CustomerOrder.deleted_at.is_(None),
            CustomerOrder.status.in_(PAID_STATUSES),
            CustomerOrder.payment_status == "SUCCESS",
            func.coalesce(CustomerOrder.paid_at, CustomerOrder.updated_at) >= start,
            func.coalesce(CustomerOrder.paid_at, CustomerOrder.updated_at) <= end,
        )
    )
    if payment_method:
        query = query.filter(CustomerOrder.payment_method == payment_method)
    if cashier_id:
        query = query.filter(CustomerOrder.cashier_id == cashier_id)
    if branch_id:
        query = query.filter(CustomerOrder.branch_id == branch_id)
    query = apply_cashier_receipts_scope(query, current_user)
    orders = query.order_by(func.coalesce(CustomerOrder.paid_at, CustomerOrder.updated_at).desc()).all()
    enrich_orders(db, orders)
    return orders


@router.get("/{order_id}", response_model=OrderPublic)
def get_order(
    order_id: str,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_can_read_orders(current_user)
    return get_order_or_404(db, order_id, current_user.restaurant_id)


@router.post("/{order_id}/claim-cashier", response_model=OrderPublic)
def claim_order_for_cashier(
    order_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_can_collect_cashier(current_user)
    order = get_order_or_404(db, order_id, current_user.restaurant_id)
    if order.status in PAID_STATUSES:
        raise HTTPException(status_code=400, detail="Cette commande est déjà payée")
    assert_order_mutable_by_cashier(order, current_user)
    if not order.assigned_cashier_id:
        order.assigned_cashier_id = current_user.id
        db.commit()
        db.refresh(order)
        background_tasks.add_task(
            emit_restaurant_event,
            current_user.restaurant_id,
            "cashier_updated",
            order_id=order.id,
        )
    return get_order_or_404(db, order.id, current_user.restaurant_id)


@router.post("/{order_id}/payment", response_model=OrderPublic)
def validate_cashier_payment(
    order_id: str,
    payload: CashierPaymentIn,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_can_collect_cashier(current_user)
    order = get_order_or_404(db, order_id, current_user.restaurant_id)
    assert_order_mutable_by_cashier(order, current_user)
    if order.status in PAID_STATUSES:
        raise HTTPException(status_code=400, detail="Cette commande est déjà payée")
    if order.payment_locked:
        raise HTTPException(status_code=409, detail="Facture verrouillée par un paiement Mobile Money actif")
    if order.status not in PAYABLE_STATUSES:
        raise HTTPException(status_code=400, detail="La caisse ne peut encaisser que les commandes prêtes ou servies")
    settle_cash_payment(
        db,
        order,
        current_user,
        payload.payment_method,
        payload.discount_amount,
        payload.cash_register_id,
    )
    try:
        from app.modules.payments.service import close_pending_payment_requests_for_order

        close_pending_payment_requests_for_order(
            db,
            order,
            current_user,
            payment_method=payload.payment_method,
        )
    except Exception:
        # L'encaissement prime : ne pas faire échouer le paiement si la clôture de demande échoue.
        pass
    db.commit()
    db.refresh(order)
    background_tasks.add_task(
        emit_restaurant_event,
        current_user.restaurant_id,
        "cashier_updated",
        order_id=order.id,
    )
    return get_order_or_404(db, order.id, current_user.restaurant_id)


@router.post("/{order_id}/promo", response_model=OrderPublic)
def apply_promotion_to_order(
    order_id: str,
    payload: PromoApplyIn,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_can_collect_cashier(current_user)
    order = get_order_or_404(db, order_id, current_user.restaurant_id)
    if order.status in PAID_STATUSES:
        raise HTTPException(status_code=400, detail="Une facture payée ne peut plus recevoir de code promo")
    if order.payment_locked:
        raise HTTPException(status_code=409, detail="Facture verrouillée par un paiement Mobile Money actif")
    subtotal = sum(float(item.line_total or 0) for item in order.items) + float(order.delivery_fee or 0)
    promo = (
        db.query(PromotionCode)
        .filter(
            PromotionCode.restaurant_id == current_user.restaurant_id,
            PromotionCode.code == normalize_promo_code(payload.code),
        )
        .first()
    )
    if not promo:
        raise HTTPException(status_code=404, detail="Code promo introuvable")
    assert_promo_usable(promo, subtotal)
    discount_amount = calculate_promo_discount(promo, subtotal)
    order.discount_amount = discount_amount
    recalculate_order_total(order)
    promo.used_count += 1
    log_action(
        db,
        current_user,
        "promo.apply",
        "order",
        order.id,
        f"Code promo {promo.code} appliqué commande {order.order_number}",
        {"code": promo.code, "discount_amount": discount_amount, "total_amount": order.total_amount},
    )
    db.commit()
    db.refresh(order)
    return get_order_or_404(db, order.id, current_user.restaurant_id)


@router.post("/{order_id}/payment-cancel", response_model=OrderPublic)
def cancel_cashier_payment(
    order_id: str,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_can_update_cashier(current_user)
    order = get_order_or_404(db, order_id, current_user.restaurant_id)
    if order.status not in PAID_STATUSES:
        raise HTTPException(status_code=400, detail="Seule une commande payée peut être annulée côté caisse")
    order.status = "Livrée"
    order.payment_status = "CANCELLED"
    order.paid_at = None
    order.cash_register_id = None
    order.assignment_status = "UNASSIGNED"
    sync_table_status(db, order)
    log_action(
        db,
        current_user,
        "payment.cancel",
        "order",
        order.id,
        f"Annulation paiement commande {order.order_number}",
        {"payment_method": order.payment_method, "total_amount": order.total_amount},
    )
    db.commit()
    db.refresh(order)
    return get_order_or_404(db, order.id, current_user.restaurant_id)


@router.post("/{order_id}/send-to-kitchen", response_model=OrderPublic)
def send_order_to_kitchen(
    order_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_can_update_orders(current_user)
    order = get_order_or_404(db, order_id, current_user.restaurant_id)
    if not order.items:
        raise HTTPException(status_code=400, detail="Ajoutez au moins un plat avant d'envoyer en cuisine")
    if order.status in PAID_STATUSES or order.status == "Annulée":
        raise HTTPException(status_code=400, detail="Cette commande ne peut plus être envoyée en cuisine")

    existing_quantities: dict[str, int] = {}
    tickets = db.query(KitchenTicketModel).filter(KitchenTicketModel.order_id == order.id).all()
    for ticket in tickets:
        existing_quantities[ticket.item_name] = existing_quantities.get(ticket.item_name, 0) + int(ticket.quantity or 0)

    table_number = str(order.table_id or order.customer_name or order.order_number)
    created_count = 0
    skipped_bar = 0
    for item in order.items:
        if item.sale_channel == "EMBALLAGE":
            continue
        dish = (
            db.query(MenuItem)
            .filter(MenuItem.id == item.menu_item_id, MenuItem.restaurant_id == order.restaurant_id)
            .one_or_none()
            if item.menu_item_id
            else None
        )
        category = (
            db.query(MenuCategory)
            .filter(MenuCategory.id == dish.category_id, MenuCategory.restaurant_id == order.restaurant_id)
            .one_or_none()
            if dish and dish.category_id
            else None
        )
        if dish is not None:
            needs_kitchen = (
                dish.requires_kitchen
                if dish.requires_kitchen is not None
                else requires_kitchen_preparation(
                    item.name,
                    dish.description,
                    category.name if category else None,
                    category.description if category else None,
                    sale_channel=item.sale_channel or dish.sale_channel,
                )
            )
        else:
            needs_kitchen = requires_kitchen_preparation(
                item.name,
                sale_channel=item.sale_channel or "REPAS",
            )
        if not needs_kitchen:
            skipped_bar += 1
            continue
        requested_quantity = int(item.quantity or 0)
        already_sent = existing_quantities.get(item.name, 0)
        quantity_to_send = requested_quantity - already_sent
        if quantity_to_send <= 0:
            continue
        db.add(
            KitchenTicketModel(
                order_id=order.id,
                table_number=table_number,
                item_name=item.name,
                quantity=quantity_to_send,
                notes=order.notes,
                status=KitchenStatus.EN_ATTENTE,
            )
        )
        created_count += 1

    previous_status = order.status
    kitchen_items = [item for item in order.items if item.sale_channel != "EMBALLAGE"]
    drinks_only = bool(kitchen_items) and skipped_bar == len(kitchen_items) and created_count == 0

    if drinks_only:
        # Boissons bar uniquement (ex. boissons gazeuses) → paiement immédiat, sans cuisine.
        order.status = "Prête"
        order.is_closed = True
        order.closed_at = utcnow()
        order.closed_by_id = current_user.id
        notify(
            db,
            restaurant_id=current_user.restaurant_id,
            role=Role.CAISSE.value,
            title="Boissons à encaisser",
            message=f"{order.order_number} : boissons uniquement — paiement immédiat ({order.total_amount} FCFA).",
            category="order",
            link="unpaid-orders",
        )
        log_action(
            db,
            current_user,
            "order.drinks_ready_for_payment",
            "order",
            order.id,
            f"Commande boissons {order.order_number} prête à encaisser",
            {
                "previous_status": previous_status,
                "new_status": order.status,
                "tickets_created": 0,
                "bar_items_skipped": skipped_bar,
                "total_amount": order.total_amount,
            },
        )
        db.commit()
        db.refresh(order)
        background_tasks.add_task(
            emit_restaurant_event,
            current_user.restaurant_id,
            "cashier_updated",
            order_id=order.id,
        )
        return get_order_or_404(db, order.id, current_user.restaurant_id)

    if order.status == "Nouvelle":
        order.status = "Acceptée"
    if created_count == 0:
        if tickets:
            raise HTTPException(status_code=400, detail="Tous les plats sont déjà envoyés en cuisine.")
        raise HTTPException(status_code=400, detail="Aucun plat à envoyer en cuisine.")
    if created_count > 0:
        notify(
            db,
            restaurant_id=current_user.restaurant_id,
            role=Role.CUISINE.value,
            title="Nouvelle commande cuisine",
            message=f"{order.order_number} contient {created_count} ticket(s) à préparer.",
            category="kitchen",
            link="dashboard",
        )
    log_action(
        db,
        current_user,
        "order.send_to_kitchen",
        "order",
        order.id,
        f"Envoi cuisine commande {order.order_number}",
        {
            "previous_status": previous_status,
            "new_status": order.status,
            "tickets_created": created_count,
            "bar_items_skipped": skipped_bar,
        },
    )
    db.commit()
    db.refresh(order)
    background_tasks.add_task(
        emit_restaurant_event,
        current_user.restaurant_id,
        "kitchen_updated",
        order_id=order.id,
    )
    return get_order_or_404(db, order.id, current_user.restaurant_id)


@router.patch("/{order_id}/status", response_model=OrderPublic)
def update_order_status(
    order_id: str,
    payload: OrderStatusUpdateIn,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_can_update_orders(current_user)
    if payload.status not in ALLOWED_STATUSES:
        raise HTTPException(status_code=400, detail="Statut de commande invalide")

    order = get_order_or_404(db, order_id, current_user.restaurant_id)
    assert_status_transition_allowed(current_user, order, payload.status)
    previous_status = order.status
    order.status = payload.status
    if payload.status in {"Livrée", "Livree"}:
        mark_order_kitchen_tickets_served(db, order.id)
    sync_table_status(db, order)
    if payload.status == "Payée" and previous_status not in PAID_STATUSES:
        order.payment_status = "SUCCESS"
        order.cashier_id = current_user.id
        if not order.created_by_cashier_id:
            order.created_by_cashier_id = current_user.id
        order.paid_at = utcnow()
        from app.modules.finance.router import post_order_sale_entry_safe

        post_order_sale_entry_safe(db, order, current_user.id)
    if payload.status in {"Prête", "Servie"}:
        notify(
            db,
            restaurant_id=current_user.restaurant_id,
            role=Role.SERVEUR.value,
            title="Commande prête" if payload.status == "Prête" else "Commande servie",
            message=f"{order.order_number}: {previous_status} -> {payload.status}",
            category="order",
            link="orders",
        )
    if payload.status == "Annulée" and previous_status != "Annulée":
        mark_order_kitchen_tickets_served(db, order.id)
        notify_order_cancelled(db, current_user, order, previous_status)
    log_action(
        db,
        current_user,
        "order.status_update" if payload.status != "Payée" else "payment.validate",
        "order",
        order.id,
        f"Statut commande {order.order_number}: {previous_status} -> {payload.status}",
        {"previous_status": previous_status, "new_status": payload.status, "total_amount": order.total_amount},
    )
    db.commit()
    db.refresh(order)
    return get_order_or_404(db, order.id, current_user.restaurant_id)


@router.patch("/{order_id}", response_model=OrderPublic)
def update_order(
    order_id: str,
    payload: OrderUpdateIn,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_can_update_orders(current_user)
    order = get_order_or_404(db, order_id, current_user.restaurant_id)
    assert_order_edit_allowed(current_user, order, payload)
    fields_set = getattr(payload, "model_fields_set", None) or payload.__fields_set__
    for field in (
        "customer_name",
        "customer_phone",
        "customer_address",
        "notes",
        "fulfillment_type",
        "payment_method",
        "discount_amount",
        "delivery_fee",
        "delivery_area_id",
    ):
        if field in fields_set:
            value = getattr(payload, field)
            if field in {"customer_name", "customer_phone"} and isinstance(value, str):
                value = value.strip()
            if field == "delivery_area_id":
                area = resolve_delivery_area(db, current_user.restaurant_id, value)
                order.delivery_area_id = area.id if area else None
                if area:
                    order.delivery_fee = float(area.delivery_fee or 0)
                continue
            setattr(order, field, value)
    if payload.status is not None:
        if payload.status not in ALLOWED_STATUSES:
            raise HTTPException(status_code=400, detail="Statut de commande invalide")
        assert_status_transition_allowed(current_user, order, payload.status)
        previous_status = order.status
        order.status = payload.status
        if payload.status == "Annulée" and order.cancelled_at is None:
            order.cancelled_at = utcnow()
            if previous_status != "Annulée":
                mark_order_kitchen_tickets_served(db, order.id)
                notify_order_cancelled(db, current_user, order, previous_status)
        sync_table_status(db, order)
    if payload.items is not None:
        replace_order_items(db, order, payload.items, current_user.restaurant_id)
    recalculate_order_total(order)
    log_action(
        db,
        current_user,
        "order.update",
        "order",
        order.id,
        f"Modification commande {order.order_number}",
        {"fields": sorted(fields_set), "status": order.status, "total_amount": order.total_amount},
    )
    db.commit()
    db.refresh(order)
    return get_order_or_404(db, order.id, current_user.restaurant_id)


@router.post("/{order_id}/close", response_model=OrderPublic)
def close_order(
    order_id: str,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    """Le serveur ferme la commande quand le client demande la note.

    Une commande fermée n'accepte plus d'ajout de plats et devient encaissable.
    """
    assert_can_update_orders(current_user)
    order = get_order_or_404(db, order_id, current_user.restaurant_id)
    if order.status in PAID_STATUSES:
        raise HTTPException(status_code=400, detail="Cette commande est déjà payée")
    if order.is_closed:
        return get_order_or_404(db, order.id, current_user.restaurant_id)
    order.is_closed = True
    order.closed_at = utcnow()
    order.closed_by_id = current_user.id
    log_action(
        db,
        current_user,
        "order.close",
        "order",
        order.id,
        f"Commande {order.order_number} fermée (note demandée)",
        {"status": order.status, "total_amount": order.total_amount},
    )
    notify(
        db,
        restaurant_id=current_user.restaurant_id,
        role=Role.CAISSE.value,
        title="Commande fermée",
        message=f"{order.order_number} fermée par le service. Prête à encaisser.",
        category="order",
        link="unpaid-orders",
    )
    db.commit()
    db.refresh(order)
    return get_order_or_404(db, order.id, current_user.restaurant_id)


@router.post("/{order_id}/reopen", response_model=OrderPublic)
def reopen_order(
    order_id: str,
    payload: OrderReopenIn,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    """Réouvre une commande fermée. Action sensible : manager/admin, motif obligatoire,
    tracée en audit et notifiée à l'administrateur (garde-fou anti-fraude)."""
    if current_user.role not in {Role.ADMIN, Role.MANAGER}:
        raise HTTPException(status_code=403, detail="Seul un manager ou un administrateur peut rouvrir une commande")
    order = get_order_or_404(db, order_id, current_user.restaurant_id)
    if order.payment_locked or order.status in PAID_STATUSES:
        raise HTTPException(status_code=409, detail="Commande déjà payée ou paiement en cours : réouverture impossible")
    if not order.is_closed:
        raise HTTPException(status_code=400, detail="Cette commande n'est pas fermée")

    reason = payload.reason.strip()
    actor = f"{current_user.first_name} {current_user.last_name}".strip() or current_user.username
    order.is_closed = False
    order.closed_at = None
    order.closed_by_id = None
    log_action(
        db,
        current_user,
        "order.reopen",
        "order",
        order.id,
        f"Commande {order.order_number} rouverte par {actor}: {reason}",
        {"status": order.status, "total_amount": order.total_amount, "reason": reason, "reopened_by": current_user.id},
    )
    # Garde-fou : alerter l'administrateur de toute réouverture.
    notify(
        db,
        restaurant_id=current_user.restaurant_id,
        role=Role.ADMIN.value,
        title="Réouverture de commande",
        message=f"{actor} a rouvert la commande {order.order_number}. Motif : {reason}",
        category="security",
        link="audit-logs",
        email=True,
    )
    db.commit()
    db.refresh(order)
    return get_order_or_404(db, order.id, current_user.restaurant_id)


@router.post("/{order_id}/assign-cash-register", response_model=OrderPublic)
def assign_cash_register(
    order_id: str,
    payload: OrderCashAssignmentIn,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    if current_user.role not in {Role.ADMIN, Role.MANAGER} and not has_permission(current_user, Permission.CASHIER_UPDATE):
        raise HTTPException(status_code=403, detail="Permission d'affectation caisse requise")
    order = get_order_or_404(db, order_id, current_user.restaurant_id)
    cash_register = get_cash_register_or_404(db, current_user.restaurant_id, payload.cash_register_id)
    assigned_cashier_id = payload.assigned_cashier_id or cash_register.responsible_user_id
    if assigned_cashier_id:
        cashier = db.query(User).filter(User.id == assigned_cashier_id, User.restaurant_id == current_user.restaurant_id).first()
        if not cashier:
            raise HTTPException(status_code=404, detail="Caissier introuvable")
    order.cash_register_id = cash_register.id
    order.assigned_cashier_id = assigned_cashier_id
    order.assignment_status = "ASSIGNED"
    order.assigned_at = utcnow()
    if assigned_cashier_id and not order.created_by_cashier_id:
        order.created_by_cashier_id = assigned_cashier_id
    log_action(
        db,
        current_user,
        "order.cash_register_assign",
        "order",
        order.id,
        f"Affectation commande {order.order_number} à {cash_register.name}",
        {"cash_register_id": cash_register.id, "assigned_cashier_id": assigned_cashier_id},
    )
    if assigned_cashier_id:
        notify(
            db,
            restaurant_id=current_user.restaurant_id,
            user_id=assigned_cashier_id,
            title="Commande en ligne affectée",
            message=f"{order.order_number} est affectée à votre caisse.",
            category="cashier",
            link="cashier",
        )
    db.commit()
    db.refresh(order)
    return get_order_or_404(db, order.id, current_user.restaurant_id)


@router.get("/dispatch/online-unassigned", response_model=list[OrderPublic])
def list_unassigned_online_orders(
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    if current_user.role not in {Role.ADMIN, Role.MANAGER, Role.CAISSE} and not has_permission(current_user, Permission.CASHIER_READ):
        raise HTTPException(status_code=403, detail="Permission caisse requise")
    orders = (
        db.query(CustomerOrder)
        .options(selectinload(CustomerOrder.items))
        .filter(
            CustomerOrder.restaurant_id == current_user.restaurant_id,
            CustomerOrder.deleted_at.is_(None),
            ~CustomerOrder.status.in_(EXCLUDED_ACTIVE_STATUSES),
            CustomerOrder.table_id.is_(None),
            CustomerOrder.assignment_status != "ASSIGNED",
        )
        .order_by(CustomerOrder.created_at.asc())
        .all()
    )
    enrich_orders(db, orders)
    return orders


@router.get("/dispatch/cash-registers")
def list_dispatch_cash_registers(
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    if current_user.role not in {Role.ADMIN, Role.MANAGER, Role.CAISSE} and not has_permission(current_user, Permission.CASHIER_READ):
        raise HTTPException(status_code=403, detail="Permission caisse requise")
    return (
        db.query(CashRegister)
        .filter(CashRegister.restaurant_id == current_user.restaurant_id, CashRegister.is_active.is_(True))
        .order_by(CashRegister.name.asc())
        .all()
    )


@router.delete("/{order_id}", status_code=204)
def delete_order(
    order_id: str,
    payload: OrderDeleteIn | None = None,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    if current_user.role != Role.ADMIN:
        raise HTTPException(status_code=403, detail="Seul l'administrateur peut supprimer une commande")
    order = get_order_or_404(db, order_id, current_user.restaurant_id)
    table_id = order.table_id
    order.status = "Archivée"
    order.cancelled_at = utcnow()
    order.deleted_at = order.cancelled_at
    order.deleted_by = current_user.id
    order.delete_reason = payload.reason.strip() if payload and payload.reason else "Commande test / archivage admin"
    # Retire immédiatement les tickets cuisine pour ne plus polluer l'écran cuisine.
    mark_order_kitchen_tickets_served(db, order.id)
    log_action(
        db,
        current_user,
        "order.archive",
        "order",
        order.id,
        f"Archivage commande {order.order_number}",
        {"status": order.status, "total_amount": order.total_amount, "reason": order.delete_reason},
    )
    if table_id:
        sync_table_status_by_id(db, table_id, current_user.restaurant_id)
    db.commit()
    return None


@router.post("/{order_id}/receipt-print", response_model=OrderPublic)
def log_receipt_print(
    order_id: str,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_can_read_orders(current_user)
    order = get_order_or_404(db, order_id, current_user.restaurant_id)
    order.printed_at = utcnow()
    order.print_count = int(order.print_count or 0) + 1
    log_action(
        db,
        current_user,
        "receipt.print",
        "order",
        order.id,
        f"Impression recu commande {order.order_number}",
        {"status": order.status, "total_amount": order.total_amount, "payment_method": order.payment_method, "printed_at": order.printed_at.isoformat(), "print_count": order.print_count},
    )
    db.commit()
    return get_order_or_404(db, order.id, current_user.restaurant_id)


def assert_can_read_orders(user: User) -> None:
    if user.role in {Role.ADMIN, Role.MANAGER}:
        return
    if any(
        has_permission(user, permission)
        for permission in (Permission.SERVICE_READ, Permission.KITCHEN_READ, Permission.CASHIER_READ)
    ):
        return
    raise HTTPException(status_code=403, detail="Permission commandes requise")


def assert_can_update_orders(user: User) -> None:
    if user.role in {Role.ADMIN, Role.MANAGER}:
        return
    if any(
        has_permission(user, permission)
        for permission in (Permission.SERVICE_UPDATE, Permission.KITCHEN_UPDATE, Permission.CASHIER_UPDATE)
    ):
        return
    raise HTTPException(status_code=403, detail="Permission de mise à jour commandes requise")


def apply_cashier_order_visibility_scope(query, user: User):
    """Caissière : commandes salle (file commune) + livraisons qu'elle a créées ou prises."""
    if user.role not in {Role.CAISSE}:
        return query
    return query.filter(
        or_(
            CustomerOrder.assigned_cashier_id == user.id,
            and_(
                CustomerOrder.assigned_cashier_id.is_(None),
                or_(
                    CustomerOrder.fulfillment_type != "Livraison",
                    CustomerOrder.created_by_cashier_id.is_(None),
                    CustomerOrder.created_by_cashier_id == user.id,
                ),
            ),
        )
    )


def apply_cashier_pending_scope(query, user: User):
    """Caissière : commandes à encaisser non assignées (hors livraisons collègues) + les siennes."""
    if user.role not in {Role.CAISSE}:
        return query
    return apply_cashier_order_visibility_scope(query, user)


def apply_cashier_receipts_scope(query, user: User):
    """Caissière : uniquement ses encaissements."""
    if user.role not in {Role.CAISSE}:
        return query
    return query.filter(CustomerOrder.cashier_id == user.id)


def assert_order_mutable_by_cashier(order: CustomerOrder, user: User) -> None:
    if user.role not in {Role.CAISSE}:
        return
    if order.assigned_cashier_id and order.assigned_cashier_id != user.id:
        raise HTTPException(
            status_code=403,
            detail="Cette commande est prise en charge par une autre caissière.",
        )
    if (
        not order.assigned_cashier_id
        and order.fulfillment_type == "Livraison"
        and order.created_by_cashier_id
        and order.created_by_cashier_id != user.id
    ):
        raise HTTPException(
            status_code=403,
            detail="Cette livraison appartient à une autre caissière.",
        )


def assert_can_read_cashier(user: User) -> None:
    if user.role in {Role.ADMIN, Role.MANAGER, Role.CAISSE} or has_permission(user, Permission.CASHIER_READ):
        return
    raise HTTPException(status_code=403, detail="Permission caisse requise")


def assert_can_update_cashier(user: User) -> None:
    if user.role in {Role.ADMIN, Role.MANAGER, Role.CAISSE} or has_permission(user, Permission.CASHIER_UPDATE):
        return
    raise HTTPException(status_code=403, detail="Permission de gestion caisse requise")


def settle_cash_payment(
    db: Session,
    order: CustomerOrder,
    user: User,
    payment_method: str,
    discount_amount: float | None = None,
    cash_register_id: str | None = None,
) -> None:
    """Encaisse une commande (espèces / règlement direct) : commande -> Payée/SUCCESS.

    Les pré-conditions (statut payable, non verrouillée, non déjà payée) doivent
    être vérifiées par l'appelant. Ne commit pas.
    """
    previous_status = order.status
    order.payment_method = (payment_method or "").strip() or order.payment_method
    if discount_amount is not None:
        order.discount_amount = discount_amount
    from app.modules.loyalty.service import apply_loyalty_on_payment

    apply_loyalty_on_payment(db, order)
    recalculate_order_total(order)
    deduct_order_packaging_stock(db, order, user.id)
    order.cashier_id = user.id
    order.assigned_cashier_id = user.id
    if not order.created_by_cashier_id:
        order.created_by_cashier_id = user.id
    if cash_register_id:
        get_cash_register_or_404(db, order.restaurant_id, cash_register_id)
        order.cash_register_id = cash_register_id
        order.assignment_status = "ASSIGNED"
        order.assigned_at = order.assigned_at or utcnow()
    order.status = "Payée"
    order.payment_status = "SUCCESS"
    order.paid_at = utcnow()
    sync_table_status(db, order)
    from app.modules.finance.router import post_order_sale_entry_safe

    post_order_sale_entry_safe(db, order, user.id)
    log_action(
        db,
        user,
        "payment.validate",
        "order",
        order.id,
        f"Paiement valide commande {order.order_number}",
        {
            "previous_status": previous_status,
            "payment_method": order.payment_method,
            "discount_amount": order.discount_amount,
            "total_amount": order.total_amount,
        },
    )


def notify_order_cancelled(db: Session, user: User, order: CustomerOrder, previous_status: str) -> None:
    """Alerte l'administrateur d'une annulation de commande (sensible financièrement)."""
    actor = f"{user.first_name} {user.last_name}".strip() or user.username
    notify(
        db,
        restaurant_id=order.restaurant_id,
        role=Role.ADMIN.value,
        title="Commande annulée",
        message=f"{order.order_number} annulée par {actor} (était « {previous_status} », {order.total_amount} FCFA).",
        category="security",
        link="orders",
        email=True,
    )


def assert_can_collect_cashier(user: User) -> None:
    if user.role in {Role.MANAGER, Role.CAISSE}:
        return
    if user.role != Role.ADMIN and has_permission(user, Permission.CASHIER_UPDATE):
        return
    raise HTTPException(status_code=403, detail="L'administrateur consulte la caisse et valide uniquement les annulations.")


def cashier_period(start_date: datetime | None, end_date: datetime | None) -> tuple[datetime, datetime]:
    """Borne inclusive de la journée caisse.

    Les clients qui envoient seulement une date (`YYYY-MM-DD`) aboutissent à
    minuit des deux côtés : sans expansion, aucun paiement de la journée ne match.
    """
    if start_date and end_date:
        start = start_date.replace(tzinfo=None) if getattr(start_date, "tzinfo", None) else start_date
        end = end_date.replace(tzinfo=None) if getattr(end_date, "tzinfo", None) else end_date
        if end.hour == 0 and end.minute == 0 and end.second == 0 and end.microsecond == 0:
            end = datetime.combine(end.date(), time.max)
        return start, end
    today = utcnow().date()
    return datetime.combine(today, time.min), datetime.combine(today, time.max)


def resolve_delivery_area(db: Session, restaurant_id: str, delivery_area_id: str | None) -> DeliveryArea | None:
    if not delivery_area_id:
        return None
    area = (
        db.query(DeliveryArea)
        .filter(
            DeliveryArea.id == delivery_area_id,
            DeliveryArea.restaurant_id == restaurant_id,
            DeliveryArea.is_active.is_(True),
        )
        .first()
    )
    if not area:
        raise HTTPException(status_code=404, detail="Quartier de livraison introuvable")
    return area


def get_cash_register_or_404(db: Session, restaurant_id: str, cash_register_id: str) -> CashRegister:
    register = (
        db.query(CashRegister)
        .filter(
            CashRegister.id == cash_register_id,
            CashRegister.restaurant_id == restaurant_id,
            CashRegister.is_active.is_(True),
        )
        .first()
    )
    if not register:
        raise HTTPException(status_code=404, detail="Caisse introuvable")
    return register


def assign_order_to_cash_register(db: Session, order: CustomerOrder, rule: str = "AUTO") -> None:
    registers = (
        db.query(CashRegister)
        .filter(CashRegister.restaurant_id == order.restaurant_id, CashRegister.is_active.is_(True))
        .all()
    )
    if not registers:
        order.assignment_status = "UNASSIGNED"
        return
    selected = None
    if order.branch_id:
        cashier_ids = [register.responsible_user_id for register in registers if register.responsible_user_id]
        branch_cashiers = {
            user_id
            for (user_id,) in db.query(User.id).filter(User.id.in_(cashier_ids), User.branch_id == order.branch_id).all()
        } if cashier_ids else set()
        selected = next((register for register in registers if register.responsible_user_id in branch_cashiers), None)
    if selected is None and len(registers) == 1:
        selected = registers[0]
    if selected is None:
        loads = dict(
            db.query(CustomerOrder.cash_register_id, func.count(CustomerOrder.id))
            .filter(
                CustomerOrder.restaurant_id == order.restaurant_id,
                CustomerOrder.deleted_at.is_(None),
                CustomerOrder.assignment_status == "ASSIGNED",
                ~CustomerOrder.status.in_(EXCLUDED_ACTIVE_STATUSES | PAID_STATUSES),
            )
            .group_by(CustomerOrder.cash_register_id)
            .all()
        )
        selected = min(registers, key=lambda register: int(loads.get(register.id, 0)))
    order.cash_register_id = selected.id
    order.assigned_cashier_id = selected.responsible_user_id
    order.assignment_status = "ASSIGNED"
    order.assigned_at = utcnow()


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
    now = utcnow()
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


def assert_status_transition_allowed(user: User, order: CustomerOrder, new_status: str) -> None:
    if order.payment_locked:
        raise HTTPException(status_code=409, detail="Facture verrouillée par un paiement Mobile Money actif")
    if order.status in PAID_STATUSES and user.role != Role.ADMIN:
        raise HTTPException(status_code=403, detail="Facture payee verrouillee. Seul l'administrateur peut la corriger.")

    if new_status == "Payée":
        if user.role == Role.ADMIN:
            raise HTTPException(status_code=403, detail="L'administrateur ne peut pas encaisser une commande.")
        if user.role not in {Role.MANAGER, Role.CAISSE} and not has_permission(user, Permission.CASHIER_UPDATE):
            raise HTTPException(status_code=403, detail="Seule la caisse peut valider un paiement")
        if order.status not in PAYABLE_STATUSES:
            raise HTTPException(status_code=400, detail="La caisse ne peut encaisser que les commandes pretes ou servies")

    if user.role == Role.SERVEUR and new_status in {"Payée", "Annulée"}:
        raise HTTPException(status_code=403, detail="Le serveur ne peut pas encaisser ou annuler une facture")

    if user.role == Role.CAISSE and new_status != "Payée":
        raise HTTPException(status_code=403, detail="La caisse ne peut pas modifier le statut d'une facture hors paiement")


def assert_order_edit_allowed(user: User, order: CustomerOrder, payload: OrderUpdateIn) -> None:
    if order.payment_locked:
        raise HTTPException(status_code=409, detail="Facture verrouillée par un paiement Mobile Money actif")
    if order.status in PAID_STATUSES and user.role != Role.ADMIN:
        raise HTTPException(status_code=403, detail="Facture payee verrouillee. Modification interdite.")
    if getattr(order, "is_closed", False) and payload.items is not None and user.role != Role.ADMIN:
        raise HTTPException(
            status_code=409,
            detail="Commande fermée : plus aucun ajout d'article possible. Rouvrez-la d'abord (manager/admin).",
        )

    fields_set = getattr(payload, "model_fields_set", None) or payload.__fields_set__
    if user.role == Role.CAISSE:
        allowed_fields = {"payment_method", "discount_amount"}
        if not fields_set.issubset(allowed_fields):
            raise HTTPException(status_code=403, detail="La caisse peut seulement preparer le mode de paiement et la remise avant encaissement")
        if order.status not in PAYABLE_STATUSES:
            raise HTTPException(status_code=400, detail="La caisse ne peut modifier que les commandes pretes ou servies")

    if user.role == Role.SERVEUR:
        forbidden_fields = {"payment_method", "discount_amount", "delivery_fee"}
        if fields_set.intersection(forbidden_fields):
            raise HTTPException(status_code=403, detail="Le serveur ne peut pas modifier les informations de facturation")


def get_order_or_404(db: Session, order_id: str, restaurant_id: str) -> CustomerOrder:
    from app.tenancy import tenant_get_or_404

    order = tenant_get_or_404(
        db,
        CustomerOrder,
        order_id,
        restaurant_id,
        detail="Commande introuvable",
        options=(selectinload(CustomerOrder.items),),
    )
    enrich_orders(db, [order])
    return order


def enrich_orders(db: Session, orders: list[CustomerOrder]) -> None:
    user_ids = {
        user_id
        for order in orders
        for user_id in (
            order.server_id,
            order.cashier_id,
            order.created_by_cashier_id,
            order.assigned_cashier_id,
        )
        if user_id
    }
    table_ids = {order.table_id for order in orders if order.table_id}
    area_ids = {order.delivery_area_id for order in orders if order.delivery_area_id}
    order_ids = [order.id for order in orders]
    users = {
        user.id: user
        for user in db.query(User).filter(User.id.in_(user_ids)).all()
    } if user_ids else {}
    tables = {
        table.id: table
        for table in db.query(TableModel).filter(TableModel.id.in_(table_ids)).all()
    } if table_ids else {}
    areas = {
        area.id: area
        for area in db.query(DeliveryArea).filter(DeliveryArea.id.in_(area_ids)).all()
    } if area_ids else {}
    tickets_by_order: dict[str, list] = {order_id: [] for order_id in order_ids}
    if order_ids:
        for ticket in db.query(KitchenTicketModel).filter(KitchenTicketModel.order_id.in_(order_ids)).all():
            tickets_by_order.setdefault(ticket.order_id, []).append(ticket)
    for order in orders:
        server = users.get(order.server_id)
        cashier = users.get(order.cashier_id)
        created_by = users.get(order.created_by_cashier_id) or users.get(order.cashier_id)
        assigned_cashier = users.get(order.assigned_cashier_id)
        table = tables.get(order.table_id)
        area = areas.get(order.delivery_area_id)
        if order.cashier_id and order.fulfillment_type == "Livraison" and not order.table_id:
            order.order_source = "Caisse"
        elif order.table_id or order.fulfillment_type == "Sur place":
            order.order_source = "Présentiel"
        else:
            order.order_source = "En ligne"
        order.server_name = f"{server.first_name} {server.last_name}" if server else None
        order.cashier_name = f"{cashier.first_name} {cashier.last_name}" if cashier else None
        order.created_by_cashier_name = f"{created_by.first_name} {created_by.last_name}" if created_by else None
        order.assigned_cashier_name = (
            f"{assigned_cashier.first_name} {assigned_cashier.last_name}" if assigned_cashier else None
        )
        if order.fulfillment_type == "Livraison" or (not order.table_id and order.fulfillment_type != "Sur place"):
            taker = created_by or cashier or assigned_cashier
            order.order_taker_name = f"{taker.first_name} {taker.last_name}" if taker else None
        else:
            order.order_taker_name = order.server_name
        order.table_name = table.number if table else None
        order.table_room = table.room if table else None
        order.delivery_area_name = area.name if area else None
        attach_kitchen_timing(order, tickets_by_order.get(order.id, []))


def _minutes_between(start, end) -> int | None:
    if not start or not end:
        return None
    try:
        delta = end - start
        return max(0, int(delta.total_seconds() // 60))
    except TypeError:
        # naive vs aware
        return None


def attach_kitchen_timing(order: CustomerOrder, tickets: list) -> None:
    """Agrege les horodatages cuisine sur la commande pour tous les roles."""
    if not tickets:
        order.kitchen_sent_at = None
        order.kitchen_started_at = None
        order.kitchen_ready_at = None
        order.kitchen_served_at = None
        order.kitchen_wait_minutes = None
        order.kitchen_prep_minutes = None
        order.kitchen_ready_wait_minutes = None
        order.kitchen_total_minutes = None
        return

    now = utcnow()
    sent_times = [t.created_at for t in tickets if t.created_at]
    started_times = [t.started_at for t in tickets if t.started_at]
    ready_times = [t.ready_at for t in tickets if t.ready_at]
    served_times = [t.served_at for t in tickets if t.served_at]

    order.kitchen_sent_at = min(sent_times) if sent_times else None
    order.kitchen_started_at = min(started_times) if started_times else None

    tickets_ready = all(
        t.ready_at is not None or t.status in {KitchenStatus.PRETE, KitchenStatus.SERVIE}
        for t in tickets
    )
    order.kitchen_ready_at = max(ready_times) if tickets_ready and ready_times else None

    all_served = all(t.status == KitchenStatus.SERVIE for t in tickets)
    order.kitchen_served_at = max(served_times) if all_served and served_times else None

    sent = order.kitchen_sent_at
    started = order.kitchen_started_at
    ready = order.kitchen_ready_at
    served = order.kitchen_served_at

    if sent and started:
        order.kitchen_wait_minutes = _minutes_between(sent, started)
    elif sent:
        order.kitchen_wait_minutes = _minutes_between(sent, now)
    else:
        order.kitchen_wait_minutes = None

    if started and ready:
        order.kitchen_prep_minutes = _minutes_between(started, ready)
    elif started:
        order.kitchen_prep_minutes = _minutes_between(started, now)
    else:
        order.kitchen_prep_minutes = None

    if ready and served:
        order.kitchen_ready_wait_minutes = _minutes_between(ready, served)
    elif ready:
        order.kitchen_ready_wait_minutes = _minutes_between(ready, now)
    else:
        order.kitchen_ready_wait_minutes = None

    end = served or ready or started or now
    order.kitchen_total_minutes = _minutes_between(sent, end) if sent else None


def sync_table_status(db: Session, order: CustomerOrder) -> None:
    if not order.table_id:
        return
    sync_table_status_by_id(db, order.table_id, order.restaurant_id)


def sync_table_status_by_id(db: Session, table_id: int, restaurant_id: str) -> None:
    table = (
        db.query(TableModel)
        .filter(TableModel.id == table_id, TableModel.restaurant_id == restaurant_id)
        .one_or_none()
    )
    if not table:
        return
    inactive_statuses = {"Payée", "Payee", "Livrée", "Livree", "Annulée", "Annulee", "Archivée", "Archivee"}
    has_active_order = (
        db.query(CustomerOrder.id)
        .filter(CustomerOrder.table_id == table_id, CustomerOrder.restaurant_id == restaurant_id)
        .filter(CustomerOrder.deleted_at.is_(None))
        .filter(~CustomerOrder.status.in_(inactive_statuses))
        .first()
        is not None
    )
    table.status = TableStatus.OCCUPEE if has_active_order else TableStatus.LIBRE


def replace_order_items(db: Session, order: CustomerOrder, payload_items, restaurant_id: str) -> None:
    quantities = {item.menu_item_id: item.quantity for item in payload_items}
    dishes = (
        db.query(MenuItem)
        .options(selectinload(MenuItem.category))
        .filter(
            MenuItem.restaurant_id == restaurant_id,
            MenuItem.id.in_(list(quantities.keys())),
            MenuItem.is_available.is_(True),
        )
        .all()
    )
    if len(dishes) != len(quantities):
        raise HTTPException(status_code=400, detail="Un ou plusieurs plats ne sont plus disponibles")
    previous_quantities: dict[str, int] = {}
    for item in order.items:
        if item.menu_item_id:
            previous_quantities[item.menu_item_id] = previous_quantities.get(item.menu_item_id, 0) + int(item.quantity or 0)
    dish_by_id = {dish.id: dish for dish in dishes}
    for menu_item_id, new_quantity in quantities.items():
        delta = int(new_quantity or 0) - previous_quantities.get(menu_item_id, 0)
        if delta:
            adjust_recipe_stock(db, restaurant_id, dish_by_id[menu_item_id], delta)
    removed_item_ids = set(previous_quantities) - set(quantities)
    if removed_item_ids:
        removed_dishes = (
            db.query(MenuItem)
            .options(selectinload(MenuItem.category))
            .filter(MenuItem.restaurant_id == restaurant_id, MenuItem.id.in_(list(removed_item_ids)))
            .all()
        )
        for dish in removed_dishes:
            adjust_recipe_stock(db, restaurant_id, dish, -previous_quantities[dish.id])
    order.items.clear()
    for dish in dishes:
        quantity = quantities[dish.id]
        order.items.append(
            CustomerOrderItem(
                menu_item_id=dish.id,
                name=dish.name,
                sale_channel=classify_menu_item(dish),
                quantity=quantity,
                unit_price=float(dish.price),
                line_total=float(dish.price) * quantity,
            )
        )


def recalculate_order_total(order: CustomerOrder) -> None:
    subtotal = sum(float(item.line_total or 0) for item in order.items if item.sale_channel != "EMBALLAGE")
    order.total_amount = max(0, subtotal + float(order.delivery_fee or 0) - float(order.discount_amount or 0))


def order_requires_packaging(order: CustomerOrder) -> bool:
    value = (order.fulfillment_type or "").lower()
    return any(token in value for token in ["livraison", "emporter", "emport", "ligne", "online"])


def calculate_packaging_requirements(db: Session, order: CustomerOrder) -> dict[str, Decimal]:
    if not order_requires_packaging(order):
        return {}
    dish_quantities: dict[str, Decimal] = {}
    for item in order.items:
        if item.menu_item_id and item.sale_channel != "EMBALLAGE":
            dish_quantities[item.menu_item_id] = dish_quantities.get(item.menu_item_id, Decimal("0")) + dec(item.quantity)
    if not dish_quantities:
        return {}
    links = (
        db.query(StockItemPackaging)
        .filter(
            StockItemPackaging.restaurant_id == order.restaurant_id,
            StockItemPackaging.menu_item_id.in_(list(dish_quantities.keys())),
            StockItemPackaging.is_active.is_(True),
        )
        .all()
    )
    requirements: dict[str, Decimal] = {}
    for link in links:
        required = dec(link.required_quantity) or Decimal("1")
        requirements[link.packaging_item_id] = requirements.get(link.packaging_item_id, Decimal("0")) + (
            required * dish_quantities.get(link.menu_item_id, Decimal("0"))
        )
    return requirements


def deduct_order_packaging_stock(db: Session, order: CustomerOrder, user_id: str | None) -> None:
    packaging_lines = [item for item in order.items if item.sale_channel == "EMBALLAGE" and item.stock_item_id]
    for line in packaging_lines:
        packaging = get_item_or_404(db, line.stock_item_id, order.restaurant_id, for_update=True)
        consume_fifo(
            db,
            packaging,
            StockLocation.MAGASIN,
            dec(line.quantity),
            StockMovementType.OUT,
            user_id,
            "Emballage facturé",
            f"Commande {order.order_number}",
            order.id,
        )
    for packaging_id, quantity in calculate_packaging_requirements(db, order).items():
        if quantity <= 0:
            continue
        packaging = get_item_or_404(db, packaging_id, order.restaurant_id, for_update=True)
        consume_fifo(
            db,
            packaging,
            StockLocation.MAGASIN,
            quantity,
            StockMovementType.OUT,
            user_id,
            "Emballage consomme",
            f"Commande {order.order_number}",
            order.id,
        )


def make_order_number(slug: str) -> str:
    return f"{slug[:6].upper()}-{utcnow().strftime('%y%m%d%H%M%S%f')[-12:]}"


def consume_recipe_stock(db: Session, restaurant_id: str, dish: MenuItem, dish_quantity: int) -> None:
    adjust_recipe_stock(db, restaurant_id, dish, dish_quantity, note_prefix="Commande en ligne")


def adjust_recipe_stock(
    db: Session,
    restaurant_id: str,
    dish: MenuItem,
    dish_quantity_delta: int,
    note_prefix: str = "Commande client",
) -> None:
    links = (
        db.query(StockRecipeIngredient)
        .filter(
            StockRecipeIngredient.restaurant_id == restaurant_id,
            StockRecipeIngredient.menu_item_id == dish.id,
        )
        .all()
    )
    for link in links:
        # Verrou pessimiste: la lecture de quantite et la consommation FIFO doivent
        # etre atomiques face a des commandes concurrentes sur le meme article.
        item = get_item_or_404(db, link.stock_item_id, restaurant_id, for_update=True)
        quantity_delta = link.quantity_per_dish * abs(dish_quantity_delta)
        location_quantity = get_location_quantity(item, link.location)
        if dish_quantity_delta > 0 and location_quantity < quantity_delta:
            raise HTTPException(status_code=400, detail=f"Stock insuffisant pour {item.name}")
        if dish_quantity_delta > 0:
            consume_fifo(
                db,
                item,
                link.location,
                quantity_delta,
                StockMovementType.OUT,
                None,
                "Commande client",
                f"{note_prefix}: +{dish_quantity_delta} x {dish.name}",
            )
            movement_type = StockMovementType.OUT
            movement_note = f"{note_prefix}: +{dish_quantity_delta} x {dish.name}"
            destination = "Commande client"
        else:
            set_location_quantity(item, link.location, location_quantity + quantity_delta)
            movement_type = StockMovementType.ADJUSTMENT
            movement_note = f"Correction commande: {dish_quantity_delta} x {dish.name}"
            destination = "Retour stock"
        if dish_quantity_delta <= 0:
            db.add(
                StockMovement(
                    restaurant_id=restaurant_id,
                    item_id=item.id,
                    movement_type=movement_type,
                    source_location=link.location,
                    destination_location=None,
                    quantity=quantity_delta,
                    unit_price=dec(item.cmup_current or item.purchase_price),
                    value=quantity_delta * dec(item.cmup_current or item.purchase_price),
                    destination=destination,
                    note=movement_note,
                )
            )
