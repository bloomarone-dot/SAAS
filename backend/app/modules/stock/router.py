from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import assert_permission, require_tenant_user
from app.modules.audit.service import log_action
from app.modules.permissions.models import Permission
from app.modules.catalog.models import MenuItem
from app.modules.orders.models import CustomerOrder, CustomerOrderItem
from app.modules.stock.models import (
    StockCostCenter,
    StockCostCenterType,
    StockDamage,
    StockInventory,
    StockInventoryLine,
    StockInventoryStatus,
    StockItem,
    StockItemPackaging,
    StockLot,
    StockLocation,
    StockMovement,
    StockMovementType,
    StockProductType,
    StockProductionSheet,
    StockRecipeIngredient,
)
from app.modules.stock.schemas import (
    InventoryCreateIn,
    InventoryLinePublic,
    InventoryLineUpdateIn,
    InventoryPublic,
    PackagingLinkIn,
    PackagingLinkPublic,
    ProductionSheetIn,
    ProductionSheetPublic,
    RecipeIngredientIn,
    RecipeIngredientPublic,
    StockDamageIn,
    StockDamagePublic,
    StockItemIn,
    StockItemPublic,
    StockItemUpdateIn,
    StockCostCenterPublic,
    StockLotPublic,
    StockMovementIn,
    StockMovementPublic,
    StockReportOut,
    StockMenuItemOut,
    StockSummaryOut,
)
from app.modules.users.models import User

router = APIRouter(prefix="/stock", tags=["stock"])

DEFAULT_COST_CENTERS = {
    StockLocation.MAGASIN: ("GRAND_MAGASIN", "Grand Magasin / Stock Principal", StockCostCenterType.MAGASIN),
    StockLocation.CUISINE: ("MAGASIN_CUISINE", "Magasin Cuisine", StockCostCenterType.CUISINE),
    StockLocation.BOISSON: ("MAGASIN_BOISSON", "Magasin Boisson / Bar", StockCostCenterType.BOISSON),
}


def get_item_or_404(
    db: Session,
    item_id: str,
    restaurant_id: str | None,
    *,
    for_update: bool = False,
) -> StockItem:
    """Charge un produit stock scope tenant.

    `for_update=True` pose un verrou de ligne (SELECT ... FOR UPDATE) pour les
    chemins de consommation concurrents, evitant la survente (TOCTOU) lorsque
    plusieurs commandes touchent simultanement le meme article.
    """
    if for_update:
        item = (
            db.query(StockItem)
            .filter(StockItem.id == item_id)
            .with_for_update()
            .one_or_none()
        )
    else:
        item = db.get(StockItem, item_id)
    if not item or item.restaurant_id != restaurant_id:
        raise HTTPException(status_code=404, detail="Produit stock introuvable")
    return item


def total_item_quantity(item: StockItem) -> float:
    return float(item.quantity or 0) + float(item.kitchen_quantity or 0) + float(item.drink_quantity or 0)


def ensure_default_cost_centers(db: Session, restaurant_id: str | None) -> dict[StockLocation, StockCostCenter]:
    if not restaurant_id:
        return {}
    existing = {
        center.code: center
        for center in db.query(StockCostCenter).filter(StockCostCenter.restaurant_id == restaurant_id).all()
    }
    centers: dict[StockLocation, StockCostCenter] = {}
    for location, (code, name, center_type) in DEFAULT_COST_CENTERS.items():
        center = existing.get(code)
        if not center:
            center = StockCostCenter(
                restaurant_id=restaurant_id,
                code=code,
                name=name,
                center_type=center_type,
                is_active=True,
            )
            db.add(center)
            db.flush()
        centers[location] = center
    return centers


def center_for_location(db: Session, restaurant_id: str | None, location: StockLocation) -> StockCostCenter:
    centers = ensure_default_cost_centers(db, restaurant_id)
    return centers[location]


def calculate_cmup(item: StockItem, incoming_quantity: float, incoming_unit_price: float) -> float:
    current_quantity = total_item_quantity(item)
    current_cmup = float(item.cmup_current or item.purchase_price or 0)
    current_value = current_quantity * current_cmup
    incoming_value = float(incoming_quantity or 0) * float(incoming_unit_price or 0)
    total_quantity = current_quantity + float(incoming_quantity or 0)
    if total_quantity <= 0:
        return float(incoming_unit_price or current_cmup or 0)
    return (current_value + incoming_value) / total_quantity


def create_lot(
    db: Session,
    item: StockItem,
    location: StockLocation,
    quantity: float,
    unit_price: float,
    cmup: float,
    expiration_date: datetime | None,
) -> StockLot:
    center = center_for_location(db, item.restaurant_id, location)
    lot = StockLot(
        restaurant_id=item.restaurant_id,
        item_id=item.id,
        cost_center_id=center.id,
        entry_date=datetime.utcnow(),
        expiration_date=expiration_date,
        initial_quantity=quantity,
        available_quantity=quantity,
        purchase_unit_price=unit_price,
        cmup_applied=cmup,
        stock_value=quantity * cmup,
    )
    db.add(lot)
    db.flush()
    return lot


def ensure_seed_lot(db: Session, item: StockItem, location: StockLocation) -> None:
    quantity = get_location_quantity(item, location)
    if quantity <= 0:
        return
    center = center_for_location(db, item.restaurant_id, location)
    existing = (
        db.query(StockLot.id)
        .filter(
            StockLot.restaurant_id == item.restaurant_id,
            StockLot.item_id == item.id,
            StockLot.cost_center_id == center.id,
            StockLot.available_quantity > 0,
        )
        .first()
    )
    if existing:
        return
    cmup = float(item.cmup_current or item.purchase_price or 0)
    create_lot(db, item, location, quantity, float(item.purchase_price or cmup), cmup, None)


def consume_fifo(
    db: Session,
    item: StockItem,
    location: StockLocation,
    quantity: float,
    movement_type: StockMovementType,
    created_by_id: str | None,
    destination: str | None = None,
    note: str | None = None,
    reference: str | None = None,
) -> tuple[float, list[StockMovement], str | None]:
    source_quantity = get_location_quantity(item, location)
    if source_quantity < quantity:
        raise HTTPException(status_code=400, detail="Stock insuffisant")
    ensure_seed_lot(db, item, location)
    center = center_for_location(db, item.restaurant_id, location)
    lots = (
        db.query(StockLot)
        .filter(
            StockLot.restaurant_id == item.restaurant_id,
            StockLot.item_id == item.id,
            StockLot.cost_center_id == center.id,
            StockLot.available_quantity > 0,
        )
        .order_by(StockLot.entry_date.asc(), StockLot.created_at.asc())
        .all()
    )
    remaining = float(quantity)
    total_value = 0.0
    movements: list[StockMovement] = []
    first_lot_id: str | None = None
    for lot in lots:
        if remaining <= 0:
            break
        consumed = min(remaining, float(lot.available_quantity or 0))
        if consumed <= 0:
            continue
        lot.available_quantity -= consumed
        lot.stock_value = max(0, lot.available_quantity * float(lot.cmup_applied or 0))
        value = consumed * float(lot.cmup_applied or item.cmup_current or item.purchase_price or 0)
        total_value += value
        first_lot_id = first_lot_id or lot.id
        movement = StockMovement(
            restaurant_id=item.restaurant_id,
            item_id=item.id,
            cost_center_id=center.id,
            lot_id=lot.id,
            movement_type=movement_type,
            source_location=location,
            destination_location=None,
            quantity=consumed,
            unit_price=float(lot.cmup_applied or 0),
            value=value,
            destination=destination,
            note=note,
            reference=reference,
            created_by_id=created_by_id,
        )
        db.add(movement)
        movements.append(movement)
        remaining -= consumed
    if remaining > 0.000001:
        raise HTTPException(status_code=400, detail="Lots FIFO insuffisants pour cette sortie")
    set_location_quantity(item, location, source_quantity - quantity)
    return total_value, movements, first_lot_id


def move_fifo_between_locations(
    db: Session,
    item: StockItem,
    source: StockLocation,
    destination: StockLocation,
    quantity: float,
    created_by_id: str | None,
    note: str | None = None,
) -> tuple[float, list[StockMovement]]:
    source_quantity = get_location_quantity(item, source)
    if source_quantity < quantity:
        raise HTTPException(status_code=400, detail="Stock insuffisant")
    ensure_seed_lot(db, item, source)
    source_center = center_for_location(db, item.restaurant_id, source)
    destination_center = center_for_location(db, item.restaurant_id, destination)
    lots = (
        db.query(StockLot)
        .filter(
            StockLot.restaurant_id == item.restaurant_id,
            StockLot.item_id == item.id,
            StockLot.cost_center_id == source_center.id,
            StockLot.available_quantity > 0,
        )
        .order_by(StockLot.entry_date.asc(), StockLot.created_at.asc())
        .all()
    )
    remaining = float(quantity)
    total_value = 0.0
    movements: list[StockMovement] = []
    for lot in lots:
        if remaining <= 0:
            break
        moved = min(remaining, float(lot.available_quantity or 0))
        if moved <= 0:
            continue
        lot.available_quantity -= moved
        lot.stock_value = max(0, lot.available_quantity * float(lot.cmup_applied or 0))
        moved_value = moved * float(lot.cmup_applied or item.cmup_current or item.purchase_price or 0)
        total_value += moved_value
        destination_lot = StockLot(
            restaurant_id=item.restaurant_id,
            item_id=item.id,
            cost_center_id=destination_center.id,
            entry_date=lot.entry_date,
            expiration_date=lot.expiration_date,
            initial_quantity=moved,
            available_quantity=moved,
            purchase_unit_price=lot.purchase_unit_price,
            cmup_applied=lot.cmup_applied,
            stock_value=moved_value,
        )
        db.add(destination_lot)
        db.flush()
        movement = StockMovement(
            restaurant_id=item.restaurant_id,
            item_id=item.id,
            cost_center_id=source_center.id,
            lot_id=lot.id,
            movement_type=StockMovementType.TRANSFER,
            source_location=source,
            destination_location=destination,
            quantity=moved,
            unit_price=float(lot.cmup_applied or 0),
            value=moved_value,
            destination=f"{DEFAULT_COST_CENTERS[destination][1]}",
            note=note,
            reference=destination_lot.id,
            created_by_id=created_by_id,
        )
        db.add(movement)
        movements.append(movement)
        remaining -= moved
    if remaining > 0.000001:
        raise HTTPException(status_code=400, detail="Lots FIFO insuffisants pour ce transfert")
    set_location_quantity(item, source, source_quantity - quantity)
    set_location_quantity(item, destination, get_location_quantity(item, destination) + quantity)
    return total_value, movements


def get_location_quantity(item: StockItem, location: StockLocation) -> float:
    if location == StockLocation.CUISINE:
        return item.kitchen_quantity
    if location == StockLocation.BOISSON:
        return item.drink_quantity
    return item.quantity


def set_location_quantity(item: StockItem, location: StockLocation, value: float) -> None:
    if location == StockLocation.CUISINE:
        item.kitchen_quantity = value
    elif location == StockLocation.BOISSON:
        item.drink_quantity = value
    else:
        item.quantity = value


def infer_transfer_destination(item: StockItem) -> StockLocation:
    if item.product_type.value == "BOISSON":
        return StockLocation.BOISSON
    return StockLocation.CUISINE


def normalize_movement_locations(
    item: StockItem,
    movement_type: StockMovementType,
    source_location: StockLocation | None,
    destination_location: StockLocation | None,
) -> tuple[StockLocation | None, StockLocation | None]:
    if movement_type == StockMovementType.IN:
        return None, StockLocation.MAGASIN
    if movement_type == StockMovementType.TRANSFER:
        return StockLocation.MAGASIN, destination_location or infer_transfer_destination(item)
    if movement_type == StockMovementType.OUT:
        return source_location or infer_transfer_destination(item), None
    if movement_type == StockMovementType.ADJUSTMENT:
        return source_location or StockLocation.MAGASIN, None
    return source_location, destination_location


def apply_movement(
    item: StockItem,
    movement_type: StockMovementType,
    quantity: float,
    source_location: StockLocation | None,
    destination_location: StockLocation | None,
) -> None:
    if movement_type == StockMovementType.IN:
        current = get_location_quantity(item, StockLocation.MAGASIN)
        set_location_quantity(item, StockLocation.MAGASIN, current + quantity)
    elif movement_type == StockMovementType.TRANSFER:
        source = source_location or StockLocation.MAGASIN
        destination = destination_location or infer_transfer_destination(item)
        source_quantity = get_location_quantity(item, source)
        if source_quantity < quantity:
            raise HTTPException(status_code=400, detail="Stock insuffisant")
        set_location_quantity(item, source, source_quantity - quantity)
        set_location_quantity(item, destination, get_location_quantity(item, destination) + quantity)
    elif movement_type == StockMovementType.OUT:
        source = source_location or infer_transfer_destination(item)
        source_quantity = get_location_quantity(item, source)
        if source_quantity < quantity:
            raise HTTPException(status_code=400, detail="Stock insuffisant")
        set_location_quantity(item, source, source_quantity - quantity)
    elif movement_type == StockMovementType.ADJUSTMENT:
        location = source_location or StockLocation.MAGASIN
        set_location_quantity(item, location, quantity)


@router.get("/summary", response_model=StockSummaryOut)
def stock_summary(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_READ)
    total_quantity = StockItem.quantity + StockItem.kitchen_quantity + StockItem.drink_quantity
    unit_cost = func.coalesce(StockItem.cmup_current, StockItem.purchase_price, 0)
    item_totals = (
        db.query(
            func.count(StockItem.id),
            func.coalesce(func.sum(total_quantity * unit_cost), 0),
            func.coalesce(func.sum(StockItem.quantity * unit_cost), 0),
            func.coalesce(func.sum(StockItem.kitchen_quantity * unit_cost), 0),
            func.coalesce(func.sum(StockItem.drink_quantity * unit_cost), 0),
        )
        .filter(StockItem.restaurant_id == current_user.restaurant_id)
        .one()
    )
    low_stock_count = (
        db.query(func.count(StockItem.id))
        .filter(StockItem.restaurant_id == current_user.restaurant_id)
        .filter(total_quantity <= StockItem.alert_threshold)
        .scalar()
        or 0
    )
    total_entries_value = (
        db.query(func.coalesce(func.sum(StockMovement.quantity * StockMovement.unit_price), 0))
        .filter(StockMovement.restaurant_id == current_user.restaurant_id)
        .filter(StockMovement.movement_type == StockMovementType.IN)
        .scalar()
        or 0
    )
    total_outputs_value = (
        db.query(func.coalesce(func.sum(StockMovement.quantity * StockMovement.unit_price), 0))
        .filter(StockMovement.restaurant_id == current_user.restaurant_id)
        .filter(StockMovement.movement_type.in_([StockMovementType.OUT, StockMovementType.TRANSFER]))
        .scalar()
        or 0
    )
    damage_loss = (
        db.query(func.coalesce(func.sum(StockDamage.estimated_loss), 0))
        .filter(StockDamage.restaurant_id == current_user.restaurant_id)
        .scalar()
    )
    loss_by_reason = {
        reason: float(value or 0)
        for reason, value in (
            db.query(StockDamage.reason, func.coalesce(func.sum(StockDamage.estimated_loss), 0))
            .filter(StockDamage.restaurant_id == current_user.restaurant_id)
            .group_by(StockDamage.reason)
            .all()
        )
    }
    center_rows = (
        db.query(StockCostCenter.name, func.coalesce(func.sum(StockLot.available_quantity * StockLot.cmup_applied), 0))
        .join(StockLot, StockLot.cost_center_id == StockCostCenter.id)
        .filter(StockCostCenter.restaurant_id == current_user.restaurant_id)
        .group_by(StockCostCenter.name)
        .all()
    )
    stock_value_by_center = {name: float(value or 0) for name, value in center_rows}
    expiring_lots_count = (
        db.query(func.count(StockLot.id))
        .filter(
            StockLot.restaurant_id == current_user.restaurant_id,
            StockLot.available_quantity > 0,
            StockLot.expiration_date.isnot(None),
            StockLot.expiration_date <= datetime.utcnow() + timedelta(days=14),
        )
        .scalar()
        or 0
    )
    consumed_value = (
        db.query(func.coalesce(func.sum(StockMovement.value), 0))
        .filter(
            StockMovement.restaurant_id == current_user.restaurant_id,
            StockMovement.movement_type == StockMovementType.OUT,
        )
        .scalar()
        or 0
    )
    revenue = (
        db.query(func.coalesce(func.sum(CustomerOrder.total_amount), 0))
        .filter(CustomerOrder.restaurant_id == current_user.restaurant_id)
        .filter(CustomerOrder.status.in_(["Payée", "Payee", "Livrée", "Livree"]))
        .scalar()
        or 0
    )
    manual_food_cost = (
        db.query(func.coalesce(func.sum(CustomerOrderItem.quantity * MenuItem.cost_per_dish), 0))
        .join(CustomerOrder, CustomerOrder.id == CustomerOrderItem.order_id)
        .join(MenuItem, MenuItem.id == CustomerOrderItem.menu_item_id)
        .filter(CustomerOrder.restaurant_id == current_user.restaurant_id)
        .filter(CustomerOrder.status.in_(["Payée", "Payee", "Livrée", "Livree"]))
        .filter(CustomerOrderItem.sale_channel != "EMBALLAGE")
        .scalar()
        or 0
    )
    packaging_consumed_value = (
        db.query(func.coalesce(func.sum(StockMovement.value), 0))
        .join(StockItem, StockItem.id == StockMovement.item_id)
        .filter(
            StockMovement.restaurant_id == current_user.restaurant_id,
            StockMovement.movement_type == StockMovementType.OUT,
            StockItem.product_type == StockProductType.EMBALLAGE,
        )
        .scalar()
        or 0
    )
    return StockSummaryOut(
        product_count=int(item_totals[0] or 0),
        low_stock_count=int(low_stock_count),
        stock_value=float(item_totals[1] or 0),
        main_stock_value=float(item_totals[2] or 0),
        kitchen_stock_value=float(item_totals[3] or 0),
        drink_stock_value=float(item_totals[4] or 0),
        total_entries_value=float(total_entries_value),
        total_outputs_value=float(total_outputs_value),
        total_damage_loss=float(damage_loss or 0),
        food_cost_percent=float((float(manual_food_cost or consumed_value or 0) / float(revenue or 1)) * 100) if revenue else 0,
        packaging_consumed_value=float(packaging_consumed_value or 0),
        expiring_lots_count=int(expiring_lots_count),
        loss_by_reason=loss_by_reason,
        stock_value_by_center=stock_value_by_center,
    )


@router.get("/menu-items", response_model=list[StockMenuItemOut])
def list_menu_items_for_stock(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_READ)
    return (
        db.query(MenuItem)
        .filter(MenuItem.restaurant_id == current_user.restaurant_id)
        .order_by(MenuItem.name.asc())
        .all()
    )


@router.get("/items", response_model=list[StockItemPublic])
def list_items(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_READ)
    return (
        db.query(StockItem)
        .filter(StockItem.restaurant_id == current_user.restaurant_id)
        .order_by(StockItem.created_at.desc())
        .all()
    )


@router.post("/items", response_model=StockItemPublic, status_code=201)
def create_item(payload: StockItemIn, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_UPDATE)
    payload_data = payload.dict()
    if not payload_data.get("cmup_current"):
        payload_data["cmup_current"] = payload_data.get("purchase_price", 0)
    item = StockItem(restaurant_id=current_user.restaurant_id, **payload_data)
    db.add(item)
    db.flush()
    for location, quantity in [
        (StockLocation.MAGASIN, item.quantity),
        (StockLocation.CUISINE, item.kitchen_quantity),
        (StockLocation.BOISSON, item.drink_quantity),
    ]:
        if quantity > 0:
            create_lot(db, item, location, quantity, item.purchase_price, item.cmup_current, None)
    log_action(db, current_user, "stock.item_create", "stock_item", item.id, f"Création produit stock {item.name}")
    db.commit()
    db.refresh(item)
    return item


@router.patch("/items/{item_id}", response_model=StockItemPublic)
def update_item(
    item_id: str,
    payload: StockItemUpdateIn,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_permission(current_user, Permission.STOCK_UPDATE)
    item = get_item_or_404(db, item_id, current_user.restaurant_id)
    for field, value in payload.dict(exclude_unset=True).items():
        setattr(item, field, value)
    log_action(db, current_user, "stock.item_update", "stock_item", item.id, f"Modification produit stock {item.name}")
    db.commit()
    db.refresh(item)
    return item


@router.get("/low-stock", response_model=list[StockItemPublic])
def list_low_stock(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_READ)
    return (
        db.query(StockItem)
        .filter(StockItem.restaurant_id == current_user.restaurant_id)
        .filter((StockItem.quantity + StockItem.kitchen_quantity + StockItem.drink_quantity) <= StockItem.alert_threshold)
        .order_by((StockItem.quantity + StockItem.kitchen_quantity + StockItem.drink_quantity).asc())
        .all()
    )


@router.get("/cost-centers", response_model=list[StockCostCenterPublic])
def list_cost_centers(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_READ)
    ensure_default_cost_centers(db, current_user.restaurant_id)
    db.commit()
    return (
        db.query(StockCostCenter)
        .filter(StockCostCenter.restaurant_id == current_user.restaurant_id, StockCostCenter.is_active.is_(True))
        .order_by(StockCostCenter.created_at.asc())
        .all()
    )


@router.get("/lots", response_model=list[StockLotPublic])
def list_lots(
    item_id: str | None = Query(default=None),
    center_id: str | None = Query(default=None),
    expiring_days: int | None = Query(default=None, ge=1, le=365),
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_permission(current_user, Permission.STOCK_READ)
    query = db.query(StockLot).filter(StockLot.restaurant_id == current_user.restaurant_id)
    if item_id:
        query = query.filter(StockLot.item_id == item_id)
    if center_id:
        query = query.filter(StockLot.cost_center_id == center_id)
    if expiring_days:
        query = query.filter(
            StockLot.expiration_date.isnot(None),
            StockLot.expiration_date <= datetime.utcnow() + timedelta(days=expiring_days),
            StockLot.available_quantity > 0,
        )
    return query.order_by(StockLot.entry_date.asc(), StockLot.created_at.asc()).all()


@router.get("/packaging-links", response_model=list[PackagingLinkPublic])
def list_packaging_links(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_READ)
    return (
        db.query(StockItemPackaging)
        .filter(StockItemPackaging.restaurant_id == current_user.restaurant_id, StockItemPackaging.is_active.is_(True))
        .order_by(StockItemPackaging.created_at.desc())
        .all()
    )


@router.post("/packaging-links", response_model=PackagingLinkPublic, status_code=201)
def create_packaging_link(payload: PackagingLinkIn, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_UPDATE)
    dish = db.get(MenuItem, payload.menu_item_id)
    if not dish or dish.restaurant_id != current_user.restaurant_id:
        raise HTTPException(status_code=404, detail="Plat introuvable")
    packaging = get_item_or_404(db, payload.packaging_item_id, current_user.restaurant_id)
    if packaging.product_type != StockProductType.EMBALLAGE:
        raise HTTPException(status_code=400, detail="L'article lié doit être un emballage")
    link = StockItemPackaging(restaurant_id=current_user.restaurant_id, **payload.dict())
    db.add(link)
    log_action(db, current_user, "stock.packaging_link_create", "stock_packaging", link.id, f"Liaison emballage {packaging.name} au plat {dish.name}")
    db.commit()
    db.refresh(link)
    return link


@router.delete("/packaging-links/{link_id}", status_code=200)
def archive_packaging_link(link_id: str, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_UPDATE)
    link = db.get(StockItemPackaging, link_id)
    if not link or link.restaurant_id != current_user.restaurant_id:
        raise HTTPException(status_code=404, detail="Liaison introuvable")
    link.is_active = False
    log_action(db, current_user, "stock.packaging_link_archive", "stock_packaging", link.id, "Archivage liaison emballage")
    db.commit()
    return {"message": "Liaison archivée"}


@router.get("/movements", response_model=list[StockMovementPublic])
def list_movements(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_READ)
    return (
        db.query(StockMovement)
        .filter(StockMovement.restaurant_id == current_user.restaurant_id)
        .order_by(StockMovement.created_at.desc())
        .all()
    )


@router.post("/movements", response_model=StockMovementPublic, status_code=201)
def create_movement(
    payload: StockMovementIn,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_permission(current_user, Permission.STOCK_UPDATE)
    item = get_item_or_404(db, payload.item_id, current_user.restaurant_id)
    source_location, destination_location = normalize_movement_locations(
        item,
        payload.movement_type,
        payload.source_location,
        payload.destination_location,
    )
    movement_value = 0.0
    valuation_delta = 0.0
    lot_id = None
    movements: list[StockMovement] = []
    if payload.movement_type == StockMovementType.IN:
        previous_cmup = float(item.cmup_current or item.purchase_price or 0)
        valuation_delta = payload.quantity * (float(payload.unit_price or previous_cmup) - previous_cmup)
        cmup = calculate_cmup(item, payload.quantity, payload.unit_price)
        apply_movement(item, payload.movement_type, payload.quantity, source_location, destination_location)
        item.purchase_price = payload.unit_price or item.purchase_price
        item.cmup_current = cmup
        lot = create_lot(db, item, StockLocation.MAGASIN, payload.quantity, payload.unit_price, cmup, payload.expiration_date)
        lot_id = lot.id
        movement_value = payload.quantity * cmup
    elif payload.movement_type == StockMovementType.TRANSFER:
        movement_value, movements = move_fifo_between_locations(
            db,
            item,
            source_location or StockLocation.MAGASIN,
            destination_location or infer_transfer_destination(item),
            payload.quantity,
            current_user.id,
            payload.note,
        )
    elif payload.movement_type == StockMovementType.OUT:
        movement_value, movements, lot_id = consume_fifo(
            db,
            item,
            source_location or infer_transfer_destination(item),
            payload.quantity,
            StockMovementType.OUT,
            current_user.id,
            payload.destination,
            payload.note,
        )
    elif payload.movement_type == StockMovementType.ADJUSTMENT:
        apply_movement(item, payload.movement_type, payload.quantity, source_location, destination_location)
        movement_value = payload.quantity * float(item.cmup_current or item.purchase_price or 0)
    payload_data = payload.dict()
    payload_data["source_location"] = source_location
    payload_data["destination_location"] = destination_location
    payload_data.pop("expiration_date", None)
    movement = None
    if not movements:
        center_location = destination_location if payload.movement_type == StockMovementType.IN else source_location
        center = center_for_location(db, current_user.restaurant_id, center_location or StockLocation.MAGASIN)
        movement = StockMovement(
            restaurant_id=current_user.restaurant_id,
            created_by_id=current_user.id,
            cost_center_id=center.id,
            lot_id=lot_id,
            value=movement_value,
            valuation_delta=valuation_delta,
            **payload_data,
        )
        db.add(movement)
    else:
        movement = movements[0]
    log_action(
        db,
        current_user,
        "stock.movement_create",
        "stock_movement",
        movement.id,
        f"Mouvement stock {payload.movement_type.value} sur {item.name}",
        {"item_id": item.id, "quantity": payload.quantity, "valuation_delta": valuation_delta},
    )
    db.commit()
    db.refresh(movement)
    return movement


@router.get("/damages", response_model=list[StockDamagePublic])
def list_damages(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_READ)
    return (
        db.query(StockDamage)
        .filter(StockDamage.restaurant_id == current_user.restaurant_id)
        .order_by(StockDamage.created_at.desc())
        .all()
    )


@router.post("/damages", response_model=StockDamagePublic, status_code=201)
def create_damage(payload: StockDamageIn, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_UPDATE)
    item = get_item_or_404(db, payload.item_id, current_user.restaurant_id)
    value, movements, first_lot_id = consume_fifo(
        db,
        item,
        payload.location,
        payload.quantity,
        StockMovementType.OUT,
        current_user.id,
        "Avarie / perte",
        payload.reason,
    )
    center = center_for_location(db, current_user.restaurant_id, payload.location)
    cmup_applied = float(item.cmup_current or item.purchase_price or 0)
    damage_data = payload.dict()
    damage_data["estimated_loss"] = value or (payload.quantity * cmup_applied)
    damage = StockDamage(
        restaurant_id=current_user.restaurant_id,
        cost_center_id=center.id,
        lot_id=first_lot_id,
        cmup_applied=cmup_applied,
        created_by_id=current_user.id,
        **damage_data,
    )
    db.add(damage)
    log_action(
        db,
        current_user,
        "stock.damage_create",
        "stock_damage",
        damage.id,
        f"Avarie stock {item.name}",
        {"item_id": item.id, "quantity": payload.quantity, "estimated_loss": damage.estimated_loss, "reason": payload.reason},
    )
    db.commit()
    db.refresh(damage)
    return damage


@router.patch("/damages/{damage_id}/account", response_model=StockDamagePublic)
def account_damage(damage_id: str, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.ACCOUNTING_UPDATE)
    damage = db.get(StockDamage, damage_id)
    if not damage or damage.restaurant_id != current_user.restaurant_id:
        raise HTTPException(status_code=404, detail="Avarie introuvable")
    damage.accounted_at = datetime.utcnow()
    log_action(db, current_user, "stock.damage_account", "stock_damage", damage.id, "Comptabilisation avarie stock")
    db.commit()
    db.refresh(damage)
    return damage


@router.get("/recipes", response_model=list[RecipeIngredientPublic])
def list_recipe_links(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_READ)
    return (
        db.query(StockRecipeIngredient)
        .filter(
            StockRecipeIngredient.restaurant_id == current_user.restaurant_id,
            StockRecipeIngredient.is_active.is_(True),
        )
        .order_by(StockRecipeIngredient.created_at.desc())
        .all()
    )


@router.post("/recipes", response_model=RecipeIngredientPublic, status_code=201)
def create_recipe_link(
    payload: RecipeIngredientIn,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_permission(current_user, Permission.STOCK_UPDATE)
    dish = db.get(MenuItem, payload.menu_item_id)
    if not dish or dish.restaurant_id != current_user.restaurant_id:
        raise HTTPException(status_code=404, detail="Plat introuvable")
    get_item_or_404(db, payload.stock_item_id, current_user.restaurant_id)
    link = StockRecipeIngredient(restaurant_id=current_user.restaurant_id, **payload.dict())
    db.add(link)
    log_action(db, current_user, "stock.recipe_link_create", "stock_recipe", link.id, "Liaison ingrédient stock à un plat")
    db.commit()
    db.refresh(link)
    return link


@router.delete("/recipes/{link_id}", status_code=200)
def delete_recipe_link(link_id: str, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_UPDATE)
    link = db.get(StockRecipeIngredient, link_id)
    if not link or link.restaurant_id != current_user.restaurant_id:
        raise HTTPException(status_code=404, detail="Liaison introuvable")
    link.is_active = False
    log_action(db, current_user, "stock.recipe_link_archive", "stock_recipe", link_id, "Archivage liaison ingrédient stock")
    db.commit()
    return {"message": "Liaison archivée"}


@router.get("/production-sheets", response_model=list[ProductionSheetPublic])
def list_production_sheets(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_READ)
    return (
        db.query(StockProductionSheet)
        .filter(StockProductionSheet.restaurant_id == current_user.restaurant_id)
        .order_by(StockProductionSheet.created_at.desc())
        .all()
    )


@router.post("/production-sheets", response_model=ProductionSheetPublic, status_code=201)
def create_production_sheet(
    payload: ProductionSheetIn,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_permission(current_user, Permission.STOCK_UPDATE)
    dish = db.get(MenuItem, payload.menu_item_id)
    if not dish or dish.restaurant_id != current_user.restaurant_id:
        raise HTTPException(status_code=404, detail="Plat introuvable")

    links = (
        db.query(StockRecipeIngredient)
        .filter(
            StockRecipeIngredient.restaurant_id == current_user.restaurant_id,
            StockRecipeIngredient.menu_item_id == payload.menu_item_id,
        )
        .all()
    )
    if not links:
        raise HTTPException(status_code=400, detail="Aucun ingrédient lié à ce plat")

    for link in links:
        item = get_item_or_404(db, link.stock_item_id, current_user.restaurant_id)
        consumed = link.quantity_per_dish * payload.quantity
        consume_fifo(
            db,
            item,
            link.location,
            consumed,
            StockMovementType.OUT,
            current_user.id,
            "Production cuisine",
            f"Fiche production: {payload.quantity} x {dish.name}",
        )

    sheet = StockProductionSheet(
        restaurant_id=current_user.restaurant_id,
        menu_item_id=payload.menu_item_id,
        quantity=payload.quantity,
        note=payload.note,
        created_by_id=current_user.id,
    )
    db.add(sheet)
    log_action(
        db,
        current_user,
        "stock.production_sheet_create",
        "production_sheet",
        sheet.id,
        f"Fiche production {payload.quantity} x {dish.name}",
        {"menu_item_id": dish.id, "quantity": payload.quantity},
    )
    db.commit()
    db.refresh(sheet)
    return sheet


@router.get("/inventories", response_model=list[InventoryPublic])
def list_inventories(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_READ)
    inventories = (
        db.query(StockInventory)
        .filter(StockInventory.restaurant_id == current_user.restaurant_id)
        .order_by(StockInventory.opened_at.desc())
        .all()
    )
    inventory_ids = [inventory.id for inventory in inventories]
    lines_by_inventory: dict[str, list[StockInventoryLine]] = {inventory.id: [] for inventory in inventories}
    if inventory_ids:
        for line in db.query(StockInventoryLine).filter(StockInventoryLine.inventory_id.in_(inventory_ids)).all():
            lines_by_inventory.setdefault(line.inventory_id, []).append(line)
    for inventory in inventories:
        inventory.lines = lines_by_inventory.get(inventory.id, [])
    return inventories


@router.post("/inventories", response_model=InventoryPublic, status_code=201)
def open_inventory(payload: InventoryCreateIn, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_UPDATE)
    existing = (
        db.query(StockInventory)
        .filter(StockInventory.restaurant_id == current_user.restaurant_id, StockInventory.status == StockInventoryStatus.OPEN)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Un inventaire est déjà ouvert")
    centers = ensure_default_cost_centers(db, current_user.restaurant_id)
    items = db.query(StockItem).filter(StockItem.restaurant_id == current_user.restaurant_id, StockItem.is_active.is_(True)).all()
    inventory = StockInventory(
        restaurant_id=current_user.restaurant_id,
        period=payload.period,
        tolerance_rate=payload.tolerance_rate,
        opened_by_id=current_user.id,
    )
    db.add(inventory)
    db.flush()
    for item in items:
        for location, center in centers.items():
            theoretical = get_location_quantity(item, location)
            db.add(
                StockInventoryLine(
                    restaurant_id=current_user.restaurant_id,
                    inventory_id=inventory.id,
                    item_id=item.id,
                    cost_center_id=center.id,
                    theoretical_stock=theoretical,
                    real_stock=None,
                )
            )
    log_action(db, current_user, "stock.inventory_open", "stock_inventory", inventory.id, f"Ouverture inventaire {payload.period}")
    db.commit()
    db.refresh(inventory)
    inventory.lines = db.query(StockInventoryLine).filter(StockInventoryLine.inventory_id == inventory.id).all()
    return inventory


@router.patch("/inventories/{inventory_id}/lines/{line_id}", response_model=InventoryLinePublic)
def update_inventory_line(
    inventory_id: str,
    line_id: str,
    payload: InventoryLineUpdateIn,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_permission(current_user, Permission.STOCK_UPDATE)
    inventory = db.get(StockInventory, inventory_id)
    if not inventory or inventory.restaurant_id != current_user.restaurant_id:
        raise HTTPException(status_code=404, detail="Inventaire introuvable")
    if inventory.status != StockInventoryStatus.OPEN:
        raise HTTPException(status_code=400, detail="Inventaire déjà clôturé")
    line = db.get(StockInventoryLine, line_id)
    if not line or line.inventory_id != inventory.id:
        raise HTTPException(status_code=404, detail="Ligne inventaire introuvable")
    item = get_item_or_404(db, line.item_id, current_user.restaurant_id)
    line.real_stock = payload.real_stock
    line.variance = float(line.theoretical_stock or 0) - payload.real_stock
    line.variance_value = abs(line.variance) * float(item.cmup_current or item.purchase_price or 0)
    tolerance_quantity = abs(float(line.theoretical_stock or 0)) * (float(inventory.tolerance_rate or 0) / 100)
    line.exceeds_threshold = abs(line.variance) > tolerance_quantity
    db.commit()
    db.refresh(line)
    return line


@router.patch("/inventories/{inventory_id}/close", response_model=InventoryPublic)
def close_inventory(inventory_id: str, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_UPDATE)
    inventory = db.get(StockInventory, inventory_id)
    if not inventory or inventory.restaurant_id != current_user.restaurant_id:
        raise HTTPException(status_code=404, detail="Inventaire introuvable")
    if inventory.status != StockInventoryStatus.OPEN:
        raise HTTPException(status_code=400, detail="Inventaire déjà clôturé")
    lines = db.query(StockInventoryLine).filter(StockInventoryLine.inventory_id == inventory.id).all()
    missing = [line for line in lines if line.real_stock is None]
    if missing:
        raise HTTPException(status_code=400, detail="Toutes les lignes doivent être saisies avant clôture")
    centers = ensure_default_cost_centers(db, current_user.restaurant_id)
    center_to_location = {center.id: location for location, center in centers.items()}
    for line in lines:
        item = get_item_or_404(db, line.item_id, current_user.restaurant_id)
        location = center_to_location.get(line.cost_center_id, StockLocation.MAGASIN)
        current_quantity = get_location_quantity(item, location)
        real_stock = float(line.real_stock or 0)
        delta = real_stock - current_quantity
        if delta > 0:
            create_lot(db, item, location, delta, float(item.purchase_price or item.cmup_current or 0), float(item.cmup_current or item.purchase_price or 0), None)
            set_location_quantity(item, location, real_stock)
        elif delta < 0:
            loss_value, _movements, first_lot_id = consume_fifo(
                db,
                item,
                location,
                abs(delta),
                StockMovementType.ADJUSTMENT,
                current_user.id,
                "Écart inventaire",
                f"Clôture inventaire {inventory.period}",
                inventory.id,
            )
            db.add(
                StockDamage(
                    restaurant_id=current_user.restaurant_id,
                    item_id=item.id,
                    cost_center_id=line.cost_center_id,
                    lot_id=first_lot_id,
                    location=location,
                    quantity=abs(delta),
                    cmup_applied=float(item.cmup_current or item.purchase_price or 0),
                    estimated_loss=loss_value,
                    reason="ECART_INVENTAIRE",
                    created_by_id=current_user.id,
                )
            )
        line.variance = float(line.theoretical_stock or 0) - real_stock
        line.variance_value = abs(line.variance) * float(item.cmup_current or item.purchase_price or 0)
    inventory.status = StockInventoryStatus.CLOSED
    inventory.closed_at = datetime.utcnow()
    inventory.closed_by_id = current_user.id
    log_action(db, current_user, "stock.inventory_close", "stock_inventory", inventory.id, f"Clôture inventaire {inventory.period}")
    db.commit()
    db.refresh(inventory)
    inventory.lines = db.query(StockInventoryLine).filter(StockInventoryLine.inventory_id == inventory.id).all()
    return inventory


@router.get("/reports", response_model=StockReportOut)
def stock_report(
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_permission(current_user, Permission.STOCK_READ)
    end = end_date or datetime.utcnow()
    start = start_date or (end - timedelta(days=7))
    items = db.query(StockItem).filter(StockItem.restaurant_id == current_user.restaurant_id).all()
    movements = (
        db.query(StockMovement)
        .filter(
            StockMovement.restaurant_id == current_user.restaurant_id,
            StockMovement.created_at >= start,
            StockMovement.created_at <= end,
        )
        .all()
    )
    damages = (
        db.query(StockDamage)
        .filter(
            StockDamage.restaurant_id == current_user.restaurant_id,
            StockDamage.created_at >= start,
            StockDamage.created_at <= end,
        )
        .all()
    )
    entries = sum(m.quantity * m.unit_price for m in movements if m.movement_type == StockMovementType.IN)
    outputs = sum(m.quantity * m.unit_price for m in movements if m.movement_type in {StockMovementType.OUT, StockMovementType.TRANSFER})
    stock_value = sum((item.quantity + item.kitchen_quantity + item.drink_quantity) * item.purchase_price for item in items)
    estimated_sales_value = sum(
        (item.quantity + item.kitchen_quantity + item.drink_quantity)
        * item.purchase_price
        * (1 + item.sale_margin_rate / 100)
        for item in items
    )
    return StockReportOut(
        start_date=start,
        end_date=end,
        entries_value=entries,
        outputs_value=outputs,
        damage_loss=sum(d.estimated_loss for d in damages),
        stock_value=stock_value,
        estimated_sales_value=estimated_sales_value,
        estimated_profit=max(0, estimated_sales_value - stock_value),
        low_stock_count=len([item for item in items if (item.quantity + item.kitchen_quantity + item.drink_quantity) <= item.alert_threshold]),
        movement_count=len(movements),
    )
