from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import assert_permission, require_tenant_user
from app.modules.permissions.models import Permission
from app.modules.catalog.models import MenuItem
from app.modules.stock.models import (
    StockDamage,
    StockItem,
    StockLocation,
    StockMovement,
    StockMovementType,
    StockProductionSheet,
    StockRecipeIngredient,
)
from app.modules.stock.schemas import (
    ProductionSheetIn,
    ProductionSheetPublic,
    RecipeIngredientIn,
    RecipeIngredientPublic,
    StockDamageIn,
    StockDamagePublic,
    StockItemIn,
    StockItemPublic,
    StockItemUpdateIn,
    StockMovementIn,
    StockMovementPublic,
    StockReportOut,
    StockMenuItemOut,
    StockSummaryOut,
)
from app.modules.users.models import User

router = APIRouter(prefix="/stock", tags=["stock"])


def get_item_or_404(db: Session, item_id: str, restaurant_id: str | None) -> StockItem:
    item = db.get(StockItem, item_id)
    if not item or item.restaurant_id != restaurant_id:
        raise HTTPException(status_code=404, detail="Produit stock introuvable")
    return item


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
    items = db.query(StockItem).filter(StockItem.restaurant_id == current_user.restaurant_id).all()
    movements = db.query(StockMovement).filter(StockMovement.restaurant_id == current_user.restaurant_id).all()
    damage_loss = (
        db.query(func.coalesce(func.sum(StockDamage.estimated_loss), 0))
        .filter(StockDamage.restaurant_id == current_user.restaurant_id)
        .scalar()
    )
    return StockSummaryOut(
        product_count=len(items),
        low_stock_count=len(
            [
                item
                for item in items
                if (item.quantity + item.kitchen_quantity + item.drink_quantity) <= item.alert_threshold
            ]
        ),
        stock_value=sum(
            (item.quantity + item.kitchen_quantity + item.drink_quantity) * item.purchase_price for item in items
        ),
        main_stock_value=sum(item.quantity * item.purchase_price for item in items),
        kitchen_stock_value=sum(item.kitchen_quantity * item.purchase_price for item in items),
        drink_stock_value=sum(item.drink_quantity * item.purchase_price for item in items),
        total_entries_value=sum(m.quantity * m.unit_price for m in movements if m.movement_type == StockMovementType.IN),
        total_outputs_value=sum(
            m.quantity * m.unit_price
            for m in movements
            if m.movement_type in {StockMovementType.OUT, StockMovementType.TRANSFER}
        ),
        total_damage_loss=float(damage_loss or 0),
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
    item = StockItem(restaurant_id=current_user.restaurant_id, **payload.dict())
    db.add(item)
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
    apply_movement(item, payload.movement_type, payload.quantity, source_location, destination_location)
    payload_data = payload.dict()
    payload_data["source_location"] = source_location
    payload_data["destination_location"] = destination_location
    movement = StockMovement(
        restaurant_id=current_user.restaurant_id,
        created_by_id=current_user.id,
        **payload_data,
    )
    db.add(movement)
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
    source_quantity = get_location_quantity(item, payload.location)
    if source_quantity < payload.quantity:
        raise HTTPException(status_code=400, detail="Stock insuffisant pour enregistrer cette avarie")
    set_location_quantity(item, payload.location, source_quantity - payload.quantity)
    damage = StockDamage(restaurant_id=current_user.restaurant_id, **payload.dict())
    db.add(damage)
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
    db.commit()
    db.refresh(damage)
    return damage


@router.get("/recipes", response_model=list[RecipeIngredientPublic])
def list_recipe_links(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_READ)
    return (
        db.query(StockRecipeIngredient)
        .filter(StockRecipeIngredient.restaurant_id == current_user.restaurant_id)
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
    db.commit()
    db.refresh(link)
    return link


@router.delete("/recipes/{link_id}", status_code=200)
def delete_recipe_link(link_id: str, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_UPDATE)
    link = db.get(StockRecipeIngredient, link_id)
    if not link or link.restaurant_id != current_user.restaurant_id:
        raise HTTPException(status_code=404, detail="Liaison introuvable")
    db.delete(link)
    db.commit()
    return {"message": "Liaison supprimée"}


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
        source_quantity = get_location_quantity(item, link.location)
        if source_quantity < consumed:
            raise HTTPException(status_code=400, detail=f"Stock insuffisant pour {item.name}")
        set_location_quantity(item, link.location, source_quantity - consumed)
        db.add(
            StockMovement(
                restaurant_id=current_user.restaurant_id,
                item_id=item.id,
                movement_type=StockMovementType.OUT,
                source_location=link.location,
                destination_location=None,
                quantity=consumed,
                unit_price=item.purchase_price,
                destination="Production cuisine",
                note=f"Fiche production: {payload.quantity} x {dish.name}",
                created_by_id=current_user.id,
            )
        )

    sheet = StockProductionSheet(
        restaurant_id=current_user.restaurant_id,
        menu_item_id=payload.menu_item_id,
        quantity=payload.quantity,
        note=payload.note,
        created_by_id=current_user.id,
    )
    db.add(sheet)
    db.commit()
    db.refresh(sheet)
    return sheet


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
