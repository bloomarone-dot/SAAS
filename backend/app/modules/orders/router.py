from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.dependencies import has_permission, require_tenant_user
from app.modules.catalog.models import MenuItem
from app.modules.orders.models import CustomerOrder, CustomerOrderItem
from app.modules.orders.schemas import OrderPublic, OrderStatusUpdateIn, OrderUpdateIn, PublicOrderCreateIn
from app.modules.permissions.models import Permission, Role
from app.modules.restaurants.models import Restaurant
from app.modules.stock.models import StockMovement, StockMovementType, StockRecipeIngredient
from app.modules.stock.router import get_item_or_404, get_location_quantity, set_location_quantity
from app.modules.users.models import User


router = APIRouter(prefix="/orders", tags=["orders"])
ALLOWED_STATUSES = {"Nouvelle", "Acceptée", "En préparation", "Prête", "Livrée", "Annulée"}


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
    order.status = payload.status
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
        order.status = payload.status
        if payload.status == "Annulée" and order.cancelled_at is None:
            order.cancelled_at = datetime.utcnow()
    if payload.items is not None:
        replace_order_items(db, order, payload.items, current_user.restaurant_id)
    recalculate_order_total(order)
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
    db.delete(order)
    db.commit()
    return None


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


def replace_order_items(db: Session, order: CustomerOrder, payload_items, restaurant_id: str) -> None:
    quantities = {item.menu_item_id: item.quantity for item in payload_items}
    dishes = (
        db.query(MenuItem)
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
