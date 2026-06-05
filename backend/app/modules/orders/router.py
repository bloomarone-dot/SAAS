from datetime import datetime
from datetime import time

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, selectinload
from app.modules.finance.orange_money import initiate_om_payment
from app.database import get_db
from app.dependencies import has_permission, require_tenant_user
from app.modules.audit.service import log_action
from app.modules.catalog.classification import classify_menu_item
from app.modules.catalog.models import MenuItem
from app.modules.finance.models import PromotionCode
from app.modules.kitchen.models import KitchenStatus, KitchenTicketModel
from app.modules.orders.models import CustomerOrder, CustomerOrderItem
from app.modules.notifications.service import notify
from app.modules.orders.schemas import CashierPaymentIn, CashierReportOut, MobileMoneyPaymentIn, OrderPublic, OrderStatusUpdateIn, OrderUpdateIn, PromoApplyIn, PublicOrderCreateIn
from app.modules.permissions.models import Permission, Role
from app.modules.restaurants.models import Restaurant
from app.modules.stock.models import StockMovement, StockMovementType, StockRecipeIngredient
from app.modules.stock.models import StockItem, StockItemPackaging, StockLocation
from app.modules.stock.router import consume_fifo, get_item_or_404, get_location_quantity, set_location_quantity
from app.modules.tables.models import TableModel, TableStatus
from app.modules.users.models import User


router = APIRouter(prefix="/orders", tags=["orders"])
ALLOWED_STATUSES = {"Nouvelle", "Acceptée", "En préparation", "Prête", "Livrée", "Payée", "Annulée"}
PAID_STATUSES = {"Payée", "Payee"}
PAYABLE_STATUSES = {"Prête", "Livrée"}


@router.post("/public/{slug}", response_model=OrderPublic, status_code=status.HTTP_201_CREATED)
def create_public_order(slug: str, payload: PublicOrderCreateIn, db: Session = Depends(get_db)):
    restaurant = (
        db.query(Restaurant)
        .filter(Restaurant.slug == slug, Restaurant.is_active.is_(True))
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
        delivery_fee=restaurant.delivery_fee if payload.fulfillment_type == "Livraison" else 0,
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
    db.commit()
    db.refresh(order)
    return get_order_or_404(db, order.id, restaurant.id)


@router.post("/{order_id}/initiate-om", response_model=OrderPublic)
async def initiate_om_payment_route(
    order_id: str,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db)
):
    order = get_order_or_404(db, order_id, current_user.restaurant_id)

    if order.status in PAID_STATUSES:
        raise HTTPException(status_code=400, detail="Cette commande est déjà payée")
    if order.total_amount <= 0:
        raise HTTPException(status_code=400, detail="Montant invalide")

    payment_result = await initiate_om_payment(
        amount=float(order.total_amount),
        phone_number=order.customer_phone,
        order_number=order.order_number
    )

    order.transaction_id = payment_result.get("transaction_id")
    order.payment_status = "En attente"
    order.payment_method = "Mobile Money"

    log_action(
        db, current_user, "payment.om_initiate", "order", order.id,
        f"Paiement OM initie pour {order.order_number}",
        {"transaction_id": order.transaction_id}
    )

    db.commit()
    db.refresh(order)
    return get_order_or_404(db, order.id, current_user.restaurant_id)


@router.get("", response_model=list[OrderPublic])
def list_orders(
    status_filter: str | None = Query(default=None, alias="status"),
    server_id: str | None = Query(default=None),
    limit: int = Query(default=150, ge=1, le=500),
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_can_read_orders(current_user)
    query = (
        db.query(CustomerOrder)
        .options(selectinload(CustomerOrder.items))
        .filter(CustomerOrder.restaurant_id == current_user.restaurant_id)
    )
    if status_filter:
        query = query.filter(CustomerOrder.status == status_filter)
    if server_id:
        query = query.filter(CustomerOrder.server_id == server_id)
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
    )
    pending_orders = (
        base_query.filter(CustomerOrder.status.in_(PAYABLE_STATUSES))
        .order_by(CustomerOrder.created_at.asc())
        .all()
    )
    receipts = (
        base_query.filter(CustomerOrder.status.in_(PAID_STATUSES))
        .filter(CustomerOrder.updated_at >= start, CustomerOrder.updated_at <= end)
        .order_by(CustomerOrder.updated_at.desc())
        .all()
    )
    total_collected = sum(float(order.total_amount or 0) for order in receipts)
    by_payment_method: dict[str, float] = {}
    for order in receipts:
        method = order.payment_method or "Non renseigné"
        by_payment_method[method] = by_payment_method.get(method, 0) + float(order.total_amount or 0)
    enrich_orders(db, pending_orders + receipts)
    return CashierReportOut(
        start_date=start,
        end_date=end,
        pending_orders_count=len(pending_orders),
        paid_orders_count=len(receipts),
        receipts_count=len(receipts),
        total_collected=total_collected,
        average_ticket=(total_collected / len(receipts)) if receipts else 0,
        by_payment_method=by_payment_method,
        pending_orders=pending_orders,
        receipts=receipts,
    )


@router.get("/{order_id}", response_model=OrderPublic)
def get_order(
    order_id: str,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_can_read_orders(current_user)
    return get_order_or_404(db, order_id, current_user.restaurant_id)


@router.post("/{order_id}/payment", response_model=OrderPublic)
def validate_cashier_payment(
    order_id: str,
    payload: CashierPaymentIn,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_can_collect_cashier(current_user)
    order = get_order_or_404(db, order_id, current_user.restaurant_id)
    if order.status in PAID_STATUSES:
        raise HTTPException(status_code=400, detail="Cette commande est déjà payée")
    if order.status not in PAYABLE_STATUSES:
        raise HTTPException(status_code=400, detail="La caisse ne peut encaisser que les commandes prêtes ou servies")
    previous_status = order.status
    order.payment_method = payload.payment_method.strip()
    if payload.discount_amount is not None:
        order.discount_amount = payload.discount_amount
    recalculate_order_total(order)
    deduct_order_packaging_stock(db, order, current_user.id)
    order.status = "Payée"
    sync_table_status(db, order)
    log_action(
        db,
        current_user,
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
    db.commit()
    db.refresh(order)
    return get_order_or_404(db, order.id, current_user.restaurant_id)


@router.post("/{order_id}/mobile-money-payment", response_model=OrderPublic)
def validate_mobile_money_payment(
    order_id: str,
    payload: MobileMoneyPaymentIn,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_can_collect_cashier(current_user)
    order = get_order_or_404(db, order_id, current_user.restaurant_id)
    if order.status in PAID_STATUSES:
        raise HTTPException(status_code=400, detail="Cette commande est déjà payée")
    if order.status not in PAYABLE_STATUSES:
        raise HTTPException(status_code=400, detail="La caisse ne peut encaisser que les commandes prêtes ou servies")

    previous_status = order.status
    order.payment_method = f"Mobile Money {payload.operator}"
    if payload.discount_amount is not None:
        order.discount_amount = payload.discount_amount
    order.notes = "\n".join(
        part for part in [
            order.notes,
            f"Paiement {payload.operator}: {payload.transaction_reference} ({payload.phone})",
        ] if part
    )
    recalculate_order_total(order)
    deduct_order_packaging_stock(db, order, current_user.id)
    order.status = "Payée"
    sync_table_status(db, order)
    notify(
        db,
        restaurant_id=current_user.restaurant_id,
        role=Role.ADMIN.value,
        title="Paiement Mobile Money validé",
        message=f"{order.order_number} payé via {payload.operator}. Référence: {payload.transaction_reference}",
        category="payment",
        link="/admin/cashier",
    )
    log_action(
        db,
        current_user,
        "payment.mobile_money_validate",
        "order",
        order.id,
        f"Paiement Mobile Money {payload.operator} commande {order.order_number}",
        {
            "previous_status": previous_status,
            "operator": payload.operator,
            "reference": payload.transaction_reference,
        },
    )
    db.commit()
    db.refresh(order)
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
    for item in order.items:
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
    if order.status == "Nouvelle":
        order.status = "Acceptée"
    notify(
        db,
        restaurant_id=current_user.restaurant_id,
        role=Role.CUISINE.value,
        title="Nouvelle commande cuisine",
        message=f"{order.order_number} contient {created_count} ticket(s) à préparer.",
        category="kitchen",
        link="/cuisine/orders",
    )
    log_action(
        db,
        current_user,
        "order.send_to_kitchen",
        "order",
        order.id,
        f"Envoi cuisine commande {order.order_number}",
        {"previous_status": previous_status, "new_status": order.status, "tickets_created": created_count},
    )
    db.commit()
    db.refresh(order)
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
    sync_table_status(db, order)
    if payload.status in {"Prête", "Servie"}:
        notify(
            db,
            restaurant_id=current_user.restaurant_id,
            role=Role.SERVEUR.value,
            title="Commande prête" if payload.status == "Prête" else "Commande servie",
            message=f"{order.order_number}: {previous_status} -> {payload.status}",
            category="order",
            link="/serveur/orders",
        )
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
    ):
        if field in fields_set:
            value = getattr(payload, field)
            if field in {"customer_name", "customer_phone"} and isinstance(value, str):
                value = value.strip()
            setattr(order, field, value)
    if payload.status is not None:
        if payload.status not in ALLOWED_STATUSES:
            raise HTTPException(status_code=400, detail="Statut de commande invalide")
        assert_status_transition_allowed(current_user, order, payload.status)
        order.status = payload.status
        if payload.status == "Annulée" and order.cancelled_at is None:
            order.cancelled_at = datetime.utcnow()
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


@router.delete("/{order_id}", status_code=204)
def delete_order(
    order_id: str,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    if current_user.role != Role.ADMIN:
        raise HTTPException(status_code=403, detail="Seul l'administrateur peut supprimer une commande")
    order = get_order_or_404(db, order_id, current_user.restaurant_id)
    table_id = order.table_id
    order.status = "Archivée"
    order.cancelled_at = datetime.utcnow()
    log_action(
        db,
        current_user,
        "order.archive",
        "order",
        order.id,
        f"Archivage commande {order.order_number}",
        {"status": order.status, "total_amount": order.total_amount},
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
    log_action(
        db,
        current_user,
        "receipt.print",
        "order",
        order.id,
        f"Impression recu commande {order.order_number}",
        {"status": order.status, "total_amount": order.total_amount, "payment_method": order.payment_method},
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


def assert_can_read_cashier(user: User) -> None:
    if user.role in {Role.ADMIN, Role.MANAGER, Role.CAISSE} or has_permission(user, Permission.CASHIER_READ):
        return
    raise HTTPException(status_code=403, detail="Permission caisse requise")


def assert_can_update_cashier(user: User) -> None:
    if user.role in {Role.ADMIN, Role.MANAGER, Role.CAISSE} or has_permission(user, Permission.CASHIER_UPDATE):
        return
    raise HTTPException(status_code=403, detail="Permission de gestion caisse requise")


def assert_can_collect_cashier(user: User) -> None:
    if user.role in {Role.MANAGER, Role.CAISSE}:
        return
    if user.role != Role.ADMIN and has_permission(user, Permission.CASHIER_UPDATE):
        return
    raise HTTPException(status_code=403, detail="L'administrateur consulte la caisse et valide uniquement les annulations.")


def cashier_period(start_date: datetime | None, end_date: datetime | None) -> tuple[datetime, datetime]:
    if start_date and end_date:
        return start_date, end_date
    today = datetime.utcnow().date()
    return datetime.combine(today, time.min), datetime.combine(today, time.max)


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


def assert_status_transition_allowed(user: User, order: CustomerOrder, new_status: str) -> None:
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
    if order.status in PAID_STATUSES and user.role != Role.ADMIN:
        raise HTTPException(status_code=403, detail="Facture payee verrouillee. Modification interdite.")

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
        if order.status in {"Prête", "Livrée"}:
            raise HTTPException(status_code=403, detail="Commande deja transformee en facture. Modification interdite au serveur.")


def get_order_or_404(db: Session, order_id: str, restaurant_id: str) -> CustomerOrder:
    order = (
        db.query(CustomerOrder)
        .options(selectinload(CustomerOrder.items))
        .filter(CustomerOrder.id == order_id, CustomerOrder.restaurant_id == restaurant_id)
        .one_or_none()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Commande introuvable")
    enrich_orders(db, [order])
    return order


def enrich_orders(db: Session, orders: list[CustomerOrder]) -> None:
    server_ids = {order.server_id for order in orders if order.server_id}
    table_ids = {order.table_id for order in orders if order.table_id}
    users = {
        user.id: user
        for user in db.query(User).filter(User.id.in_(server_ids)).all()
    } if server_ids else {}
    tables = {
        table.id: table
        for table in db.query(TableModel).filter(TableModel.id.in_(table_ids)).all()
    } if table_ids else {}
    for order in orders:
        server = users.get(order.server_id)
        table = tables.get(order.table_id)
        order.order_source = "Présentiel" if order.table_id or order.fulfillment_type == "Sur place" else "En ligne"
        order.server_name = f"{server.first_name} {server.last_name}" if server else None
        order.table_name = table.number if table else None
        order.table_room = table.room if table else None


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
    inactive_statuses = {"Payée", "Payee", "Livrée", "Livree", "Annulée", "Annulee"}
    has_active_order = (
        db.query(CustomerOrder.id)
        .filter(CustomerOrder.table_id == table_id, CustomerOrder.restaurant_id == restaurant_id)
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


def calculate_packaging_requirements(db: Session, order: CustomerOrder) -> dict[str, float]:
    if not order_requires_packaging(order):
        return {}
    dish_quantities: dict[str, float] = {}
    for item in order.items:
        if item.menu_item_id and item.sale_channel != "EMBALLAGE":
            dish_quantities[item.menu_item_id] = dish_quantities.get(item.menu_item_id, 0) + float(item.quantity or 0)
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
    requirements: dict[str, float] = {}
    for link in links:
        requirements[link.packaging_item_id] = requirements.get(link.packaging_item_id, 0) + (
            float(link.required_quantity or 1) * float(dish_quantities.get(link.menu_item_id, 0))
        )
    return requirements


def deduct_order_packaging_stock(db: Session, order: CustomerOrder, user_id: str | None) -> None:
    packaging_lines = [item for item in order.items if item.sale_channel == "EMBALLAGE" and item.stock_item_id]
    for line in packaging_lines:
        packaging = get_item_or_404(db, line.stock_item_id, order.restaurant_id)
        consume_fifo(
            db,
            packaging,
            StockLocation.MAGASIN,
            float(line.quantity or 0),
            StockMovementType.OUT,
            user_id,
            "Emballage facturé",
            f"Commande {order.order_number}",
            order.id,
        )
    for packaging_id, quantity in calculate_packaging_requirements(db, order).items():
        if quantity <= 0:
            continue
        packaging = get_item_or_404(db, packaging_id, order.restaurant_id)
        consume_fifo(
            db,
            packaging,
            StockLocation.MAGASIN,
            float(quantity),
            StockMovementType.OUT,
            user_id,
            "Emballage consomme",
            f"Commande {order.order_number}",
            order.id,
        )


def make_order_number(slug: str) -> str:
    return f"{slug[:6].upper()}-{datetime.utcnow().strftime('%y%m%d%H%M%S%f')[-12:]}"


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
        item = get_item_or_404(db, link.stock_item_id, restaurant_id)
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
                    unit_price=item.cmup_current or item.purchase_price,
                    value=quantity_delta * float(item.cmup_current or item.purchase_price or 0),
                    destination=destination,
                    note=movement_note,
                )
            )
