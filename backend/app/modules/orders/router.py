from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.dependencies import has_permission, require_tenant_user
from app.modules.audit.service import log_action
from app.modules.catalog.classification import classify_menu_item
from app.modules.catalog.models import MenuItem
from app.modules.orders.models import CustomerOrder, CustomerOrderItem
from app.modules.orders.schemas import OrderPublic, OrderStatusUpdateIn, OrderUpdateIn, PublicOrderCreateIn
from app.modules.permissions.models import Permission, Role
from app.modules.restaurants.models import Restaurant
from app.modules.stock.models import StockMovement, StockMovementType, StockRecipeIngredient
from app.modules.stock.router import get_item_or_404, get_location_quantity, set_location_quantity
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
    order.total_amount = max(0, total + order.delivery_fee - order.discount_amount)
    db.add(order)
    db.commit()
    db.refresh(order)
    return get_order_or_404(db, order.id, restaurant.id)


@router.get("", response_model=list[OrderPublic])
def list_orders(
    status_filter: str | None = Query(default=None, alias="status"),
    server_id: str | None = Query(default=None),
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
    return query.order_by(CustomerOrder.created_at.desc()).all()


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
    log_action(
        db,
        current_user,
        "order.delete",
        "order",
        order.id,
        f"Suppression commande {order.order_number}",
        {"status": order.status, "total_amount": order.total_amount},
    )
    db.delete(order)
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


def assert_status_transition_allowed(user: User, order: CustomerOrder, new_status: str) -> None:
    if order.status in PAID_STATUSES and user.role != Role.ADMIN:
        raise HTTPException(status_code=403, detail="Facture payee verrouillee. Seul l'administrateur peut la corriger.")

    if new_status == "Payée":
        if user.role not in {Role.ADMIN, Role.MANAGER, Role.CAISSE} and not has_permission(user, Permission.CASHIER_UPDATE):
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
    return order


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
    subtotal = sum(item.line_total for item in order.items)
    order.total_amount = max(0, subtotal + float(order.delivery_fee or 0) - float(order.discount_amount or 0))


def make_order_number(slug: str) -> str:
    return f"{slug[:6].upper()}-{datetime.utcnow().strftime('%y%m%d%H%M%S%f')[-12:]}"


def consume_recipe_stock(db: Session, restaurant_id: str, dish: MenuItem, dish_quantity: int) -> None:
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
        consumed = link.quantity_per_dish * dish_quantity
        source_quantity = get_location_quantity(item, link.location)
        if source_quantity < consumed:
            raise HTTPException(status_code=400, detail=f"Stock insuffisant pour {item.name}")
        set_location_quantity(item, link.location, source_quantity - consumed)
        db.add(
            StockMovement(
                restaurant_id=restaurant_id,
                item_id=item.id,
                movement_type=StockMovementType.OUT,
                source_location=link.location,
                destination_location=None,
                quantity=consumed,
                unit_price=item.purchase_price,
                destination="Commande client",
                note=f"Commande en ligne: {dish_quantity} x {dish.name}",
            )
        )
