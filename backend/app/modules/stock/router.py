from datetime import datetime, timedelta
from app.modules.shared.models import utcnow
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, case, func, inspect, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import assert_permission, require_tenant_user
from app.tenancy import tenant_get_or_404, tenant_get_optional, tenant_find
from app.modules.audit.service import log_action
from app.modules.catalog.models import MenuItem
from app.modules.notifications.service import notify
from app.modules.orders.models import CustomerOrder, CustomerOrderItem
from app.modules.permissions.models import Permission
from app.modules.stock.models import (
    Depot,
    DepotType,
    Inventory,
    InventoryDetail,
    InventoryStatus,
    Product,
    StockCategory,
    StockItemPackaging,
    StockLocation,
    StockLossReason,
    StockMovement,
    StockMovementStatus,
    StockMovementType,
    StockProductType,
    StockLot,
    StockProductionSheet,
    StockRecipeIngredient,
    Supplier,
    Unit,
)
from app.modules.stock.schemas import (
    CategoryIn,
    CategoryPublic,
    DepotIn,
    DepotPublic,
    DepotStockRow,
    DepotUpdateIn,
    ExportAuditIn,
    InventoryCreateIn,
    InventoryDetailPublic,
    InventoryLineUpdateIn,
    InventoryPublic,
    PackagingLinkIn,
    PackagingLinkPublic,
    ProductIn,
    ProductPublic,
    ProductStockByDepot,
    ProductUpdateIn,
    ProductionSheetIn,
    ProductionSheetPublic,
    RecipeIngredientIn,
    RecipeIngredientPublic,
    StockEntryIn,
    StockMenuItemOut,
    StockMovementIn,
    StockMovementPublic,
    StockMovementUpdateIn,
    StockOutputIn,
    StockReportOut,
    StockSummaryOut,
    StockTransferIn,
    SupplierIn,
    SupplierPublic,
    UnitIn,
    UnitPublic,
)
from app.modules.users.models import User

router = APIRouter(prefix="/stock", tags=["stock"])

DEFAULT_DEPOTS = [
    ("MAIN", "Magasin principal", DepotType.PRINCIPAL, "Depot principal de reception des achats"),
    ("DRINK", "Stock boisson", DepotType.BOISSON, "Depot dedie aux boissons"),
    ("KITCHEN", "Stock cuisine", DepotType.CUISINE, "Depot dedie a la cuisine"),
    ("AVARIE", "Stock avarie", DepotType.AUTRE, "Depot dedie aux produits avaries ou perdus"),
]
DEFAULT_UNITS = [
    ("piece", "piece"),
    ("kg", "kg"),
    ("1/4 kg", "1/4 kg"),
    ("litre", "L"),
    ("bouteille", "btle"),
    ("carton", "ctn"),
    ("paquet", "paquet"),
]


def normalize_unit_key(name: str | None, symbol: str | None = None) -> str:
    value = (name or symbol or "").strip().lower()
    value = value.replace("¼", "1/4")
    value = " ".join(value.split())
    aliases = {
        "quart kg": "1/4 kg",
        "quart kilo": "1/4 kg",
        "0.25 kg": "1/4 kg",
        "250g": "1/4 kg",
        "250 g": "1/4 kg",
        "pcs": "piece",
        "pièce": "piece",
        "pieces": "piece",
        "paquets": "paquet",
        "packet": "paquet",
    }
    return aliases.get(value, value)


def normalize_depot_code(code: str | None) -> str:
    return (code or "").strip().upper()


LOCATION_DEPOT_CODE = {
    StockLocation.MAGASIN: "MAIN",
    StockLocation.CUISINE: "KITCHEN",
    StockLocation.BOISSON: "DRINK",
}
IN_TYPES = {StockMovementType.ENTRY, StockMovementType.DIRECT_ENTRY, StockMovementType.INVENTORY_PLUS}
OUT_TYPES = {StockMovementType.OUTPUT, StockMovementType.LOSS, StockMovementType.INVENTORY_MINUS}
# Inclut les valeurs legacy normalisées par normalize_type (IN->ENTRY, OUT->OUTPUT, ADJUSTMENT->INVENTORY_PLUS).
SQL_IN_TYPES = [StockMovementType.ENTRY, StockMovementType.DIRECT_ENTRY, StockMovementType.INVENTORY_PLUS, StockMovementType.IN, StockMovementType.ADJUSTMENT]
SQL_OUT_TYPES = [StockMovementType.OUTPUT, StockMovementType.LOSS, StockMovementType.INVENTORY_MINUS, StockMovementType.OUT]


def ensure_default_data(db: Session, restaurant_id: str | None) -> None:
    if not restaurant_id:
        return
    existing_depots = {
        normalize_depot_code(depot.code): depot
        for depot in db.query(Depot).filter(Depot.restaurant_id == restaurant_id).all()
    }
    for code, name, depot_type, description in DEFAULT_DEPOTS:
        normalized_code = normalize_depot_code(code)
        if normalized_code not in existing_depots:
            db.add(Depot(restaurant_id=restaurant_id, code=code, name=name, type=depot_type, description=description))
    existing_units: dict[str, Unit] = {}
    for unit in db.query(Unit).filter(Unit.restaurant_id == restaurant_id).all():
        existing_units.setdefault(normalize_unit_key(unit.name, unit.symbol), unit)
        existing_units.setdefault(normalize_unit_key(unit.symbol, unit.name), unit)
    for name, symbol in DEFAULT_UNITS:
        if normalize_unit_key(name, symbol) not in existing_units and normalize_unit_key(symbol, name) not in existing_units:
            db.add(Unit(restaurant_id=restaurant_id, name=name, symbol=symbol))
    db.flush()
    migrate_legacy_stock_items(db, restaurant_id)


def _session_inspector(db: Session):
    """Inspector sur la connexion de la session (évite une 2e DB SQLite :memory:)."""
    return inspect(db.connection())


def migrate_legacy_stock_items(db: Session, restaurant_id: str) -> None:
    """Convertit les anciennes colonnes quantite en mouvements initiaux.

    L'ancien modele stockait les quantites dans `stock_items.quantity`,
    `kitchen_quantity` et `drink_quantity`. Si la table existe encore, on copie
    les produits avec le meme id pour preserver les liaisons recettes/commandes,
    puis on cree des mouvements ENTRY valides dans le depot correspondant.
    """
    inspector = _session_inspector(db)
    if "stock_items" not in inspector.get_table_names():
        return
    if db.query(Product.id).filter(Product.restaurant_id == restaurant_id).first():
        return
    columns = {column["name"] for column in inspector.get_columns("stock_items")}
    required = {"id", "restaurant_id", "name", "unit", "quantity", "kitchen_quantity", "drink_quantity"}
    if not required.issubset(columns):
        return
    rows = db.execute(
        text(
            """
            SELECT id, name, product_type, unit, quantity, kitchen_quantity, drink_quantity,
                   alert_threshold, purchase_price, packaging_sale_price, sale_margin_rate,
                   is_active, created_at
            FROM stock_items
            WHERE restaurant_id = :restaurant_id
            """
        ),
        {"restaurant_id": restaurant_id},
    ).mappings().all()
    if not rows:
        return
    depots = depots_by_code(db, restaurant_id)
    user_id = default_user_id(db, restaurant_id)
    for row in rows:
        unit = resolve_unit(db, restaurant_id, row.get("unit") or "piece")
        product = Product(
            id=row["id"],
            restaurant_id=restaurant_id,
            code=None,
            name=row["name"],
            product_type=safe_product_type(row.get("product_type")),
            unit_id=unit.id,
            purchase_price=float(row.get("purchase_price") or 0),
            minimum_stock=float(row.get("alert_threshold") or 0),
            packaging_sale_price=float(row.get("packaging_sale_price") or 0),
            sale_margin_rate=float(row.get("sale_margin_rate") or 0),
            is_active=bool(row.get("is_active", True)),
            created_at=row.get("created_at") or utcnow(),
        )
        db.add(product)
        for quantity, depot_code in [
            (row.get("quantity"), "MAIN"),
            (row.get("kitchen_quantity"), "KITCHEN"),
            (row.get("drink_quantity"), "DRINK"),
        ]:
            if float(quantity or 0) > 0:
                add_movement(
                    db,
                    restaurant_id=restaurant_id,
                    user_id=user_id,
                    movement_type=StockMovementType.ENTRY,
                    product_id=product.id,
                    quantity=float(quantity or 0),
                    destination_depot_id=depots[depot_code].id,
                    unit_price=product.purchase_price,
                    reason="Migration ancien stock: depot estime depuis les anciennes colonnes",
                    reference="legacy-stock-migration",
                    movement_date=utcnow(),
                )


def safe_product_type(value: str | None) -> StockProductType:
    try:
        return StockProductType(value or StockProductType.INGREDIENT.value)
    except ValueError:
        return StockProductType.INGREDIENT


def ensure_product_creation_columns(db: Session) -> None:
    """Sécurise les colonnes nécessaires à la création produit sur les bases locales anciennes.

    Le projet n'a pas encore une chaîne Alembic complète. Cette garde évite que
    l'ancien schéma `products` bloque le formulaire simplifié Code/Nom/Unité/Seuil.
    """
    inspector = _session_inspector(db)
    if "products" not in inspector.get_table_names():
        return
    existing = {column["name"] for column in inspector.get_columns("products")}
    columns = {
        "code": "VARCHAR(60) NULL",
        "product_type": "VARCHAR(30) NOT NULL DEFAULT 'INGREDIENT'",
        "category_id": "VARCHAR(36) NULL",
        "unit_id": "VARCHAR(36) NULL",
        "purchase_unit_id": "VARCHAR(36) NULL",
        "purchase_factor": "DECIMAL(14,4) NOT NULL DEFAULT 1",
        "purchase_price": "DECIMAL(14,2) NOT NULL DEFAULT 0",
        "cmup": "DECIMAL(14,2) NOT NULL DEFAULT 0",
        "minimum_stock": "DECIMAL(14,3) NOT NULL DEFAULT 0",
        "packaging_sale_price": "DECIMAL(14,2) NOT NULL DEFAULT 0",
        "sale_margin_rate": "DECIMAL(7,4) NOT NULL DEFAULT 0",
        "is_active": "BOOLEAN NOT NULL DEFAULT TRUE",
        "created_at": "DATETIME NULL",
        "updated_at": "DATETIME NULL",
    }
    for name, definition in columns.items():
        if name not in existing:
            db.execute(text(f"ALTER TABLE products ADD COLUMN {name} {definition}"))
    if "created_at" not in existing:
        db.execute(text("UPDATE products SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL"))
    if "updated_at" not in existing:
        db.execute(text("UPDATE products SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL"))
    if db.bind.dialect.name == "mysql":
        db.execute(text("ALTER TABLE products MODIFY COLUMN product_type VARCHAR(30) NOT NULL DEFAULT 'INGREDIENT'"))
    db.flush()


def ensure_stock_entry_columns(db: Session) -> None:
    """Prépare les tables nécessaires à l'enregistrement d'une entrée de stock."""
    ensure_product_creation_columns(db)
    inspector = _session_inspector(db)
    tables = set(inspector.get_table_names())
    if "stock_movements" not in tables:
        StockMovement.__table__.create(bind=db.bind, checkfirst=True)
        tables.add("stock_movements")
    existing = {column["name"] for column in inspector.get_columns("stock_movements")}
    columns = {
        "restaurant_id": "VARCHAR(36) NOT NULL",
        "movement_date": "DATETIME NULL",
        "movement_type": "VARCHAR(30) NOT NULL",
        "product_id": "VARCHAR(36) NOT NULL",
        "item_id": "VARCHAR(36) NULL",
        "cost_center_id": "VARCHAR(36) NULL",
        "lot_id": "VARCHAR(36) NULL",
        "source_depot_id": "VARCHAR(36) NULL",
        "destination_depot_id": "VARCHAR(36) NULL",
        "quantity": "DECIMAL(14,3) NOT NULL DEFAULT 0",
        "unit_price": "DECIMAL(14,2) NULL",
        "total_amount": "DECIMAL(14,2) NULL",
        "production_cost": "DECIMAL(14,2) NULL",
        "value": "DECIMAL(14,2) NOT NULL DEFAULT 0",
        "valuation_delta": "DECIMAL(14,2) NOT NULL DEFAULT 0",
        "supplier_id": "VARCHAR(36) NULL",
        "reason": "TEXT NULL",
        "reference": "VARCHAR(160) NULL",
        "status": "VARCHAR(30) NOT NULL DEFAULT 'validated'",
        "created_by_id": "VARCHAR(36) NULL",
        "created_by": "VARCHAR(36) NULL",
        "validated_by": "VARCHAR(36) NULL",
        "validated_at": "DATETIME NULL",
        "cancelled_movement_id": "VARCHAR(36) NULL",
        "created_at": "DATETIME NULL",
        "updated_at": "DATETIME NULL",
    }
    for name, definition in columns.items():
        if name not in existing:
            db.execute(text(f"ALTER TABLE stock_movements ADD COLUMN {name} {definition}"))
    if "movement_date" not in existing:
        db.execute(text("UPDATE stock_movements SET movement_date = CURRENT_TIMESTAMP WHERE movement_date IS NULL"))
    if "created_at" not in existing:
        db.execute(text("UPDATE stock_movements SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL"))
    if "updated_at" not in existing:
        db.execute(text("UPDATE stock_movements SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL"))
    if db.bind.dialect.name == "mysql":
        db.execute(text("ALTER TABLE stock_movements MODIFY COLUMN movement_type VARCHAR(30) NOT NULL"))
        db.execute(text("ALTER TABLE stock_movements MODIFY COLUMN status VARCHAR(30) NOT NULL DEFAULT 'validated'"))

    if "stock_lots" not in tables:
        StockLot.__table__.create(bind=db.bind, checkfirst=True)
    else:
        existing_lots = {column["name"] for column in inspector.get_columns("stock_lots")}
        lot_columns = {
            "restaurant_id": "VARCHAR(36) NOT NULL",
            "product_id": "VARCHAR(36) NOT NULL",
            "item_id": "VARCHAR(36) NULL",
            "depot_id": "VARCHAR(36) NOT NULL",
            "cost_center_id": "VARCHAR(36) NULL",
            "entry_date": "DATETIME NULL",
            "lot_number": "VARCHAR(80) NULL",
            "expiry_date": "DATETIME NULL",
            "expiration_date": "DATETIME NULL",
            "quantity_initial": "DECIMAL(14,3) NOT NULL DEFAULT 0",
            "quantity_remaining": "DECIMAL(14,3) NOT NULL DEFAULT 0",
            "unit_cost": "DECIMAL(14,2) NOT NULL DEFAULT 0",
            "initial_quantity": "FLOAT NOT NULL DEFAULT 0",
            "available_quantity": "FLOAT NOT NULL DEFAULT 0",
            "purchase_unit_price": "FLOAT NOT NULL DEFAULT 0",
            "cmup_applied": "FLOAT NOT NULL DEFAULT 0",
            "stock_value": "FLOAT NOT NULL DEFAULT 0",
            "movement_id": "VARCHAR(36) NULL",
            "created_at": "DATETIME NULL",
            "updated_at": "DATETIME NULL",
        }
        for name, definition in lot_columns.items():
            if name not in existing_lots:
                db.execute(text(f"ALTER TABLE stock_lots ADD COLUMN {name} {definition}"))
    db.flush()


def ensure_legacy_stock_references(
    db: Session,
    *,
    restaurant_id: str,
    product: Product,
    source_depot_id: str | None = None,
    destination_depot_id: str | None = None,
) -> None:
    """Synchronise les références legacy encore imposées par certaines bases locales.

    Des installations existantes ont gardé des clés étrangères de `stock_movements`
    vers `stock_items` et `stock_cost_centers`, alors que le modèle courant utilise
    `products` et `depots`. On crée seulement les lignes miroir manquantes.
    """
    inspector = _session_inspector(db)
    tables = set(inspector.get_table_names())
    if "stock_items" in tables:
        exists = db.execute(text("SELECT 1 FROM stock_items WHERE id = :id"), {"id": product.id}).first()
        if not exists:
            unit = unit_for_product(db, product)
            unit_label = getattr(unit, "symbol", None) or getattr(unit, "name", None) or "piece"
            db.execute(
                text(
                    """
                    INSERT INTO stock_items (
                        id, restaurant_id, name, product_type, unit, quantity, kitchen_quantity,
                        drink_quantity, alert_threshold, purchase_price, cmup_current,
                        packaging_sale_price, is_active, sale_margin_rate, created_at, updated_at
                    )
                    VALUES (
                        :id, :restaurant_id, :name, :product_type, :unit, 0, 0,
                        0, :minimum_stock, :purchase_price, :cmup,
                        :packaging_sale_price, :is_active, :sale_margin_rate, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                    )
                    """
                ),
                {
                    "id": product.id,
                    "restaurant_id": restaurant_id,
                    "name": product.name,
                    "product_type": getattr(product.product_type, "value", product.product_type) or StockProductType.INGREDIENT.value,
                    "unit": unit_label,
                    "minimum_stock": float(product.minimum_stock or 0),
                    "purchase_price": float(product.purchase_price or 0),
                    "cmup": float(product.cmup or 0),
                    "packaging_sale_price": float(product.packaging_sale_price or 0),
                    "is_active": bool(product.is_active),
                    "sale_margin_rate": float(product.sale_margin_rate or 0),
                },
            )

    if "stock_cost_centers" not in tables:
        return
    for depot_id in {source_depot_id, destination_depot_id}:
        if not depot_id:
            continue
        exists = db.execute(text("SELECT 1 FROM stock_cost_centers WHERE id = :id"), {"id": depot_id}).first()
        if exists:
            continue
        depot = tenant_get_optional(db, Depot, depot_id, restaurant_id, detail="Depot introuvable")
        if not depot:
            continue
        center_type = StockLocation.MAGASIN.value
        if depot.type == DepotType.CUISINE:
            center_type = StockLocation.CUISINE.value
        elif depot.type == DepotType.BOISSON:
            center_type = StockLocation.BOISSON.value
        db.execute(
            text(
                """
                INSERT INTO stock_cost_centers (
                    id, restaurant_id, name, code, center_type, is_active, created_at, updated_at
                )
                VALUES (
                    :id, :restaurant_id, :name, :code, :center_type, :is_active, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
                """
            ),
            {
                "id": depot.id,
                "restaurant_id": restaurant_id,
                "name": depot.name,
                "code": depot.code,
                "center_type": center_type,
                "is_active": bool(depot.is_active),
            },
        )


def default_user_id(db: Session, restaurant_id: str) -> str:
    user_id = db.query(User.id).filter(User.restaurant_id == restaurant_id).order_by(User.created_at.asc()).scalar()
    if not user_id:
        raise HTTPException(status_code=400, detail="Aucun utilisateur restaurant disponible pour journaliser le mouvement")
    return user_id


def depots_by_code(db: Session, restaurant_id: str) -> dict[str, Depot]:
    return {depot.code: depot for depot in db.query(Depot).filter(Depot.restaurant_id == restaurant_id).all()}


def depot_for_location(db: Session, restaurant_id: str, location: StockLocation) -> Depot:
    depots = depots_by_code(db, restaurant_id)
    return depots[LOCATION_DEPOT_CODE[location]]


def resolve_unit(db: Session, restaurant_id: str, value: str | None) -> Unit:
    if value:
        unit = tenant_get_optional(db, Unit, value, restaurant_id, detail="Unite introuvable")
        if unit:
            return unit
        unit = (
            db.query(Unit)
            .filter(Unit.restaurant_id == restaurant_id)
            .filter(Unit.name.ilike(value.strip()))
            .first()
        )
        if unit:
            return unit
    unit = db.query(Unit).filter(Unit.restaurant_id == restaurant_id).order_by(Unit.created_at.asc()).first()
    if not unit:
        unit = Unit(restaurant_id=restaurant_id, name="piece", symbol="piece")
        db.add(unit)
        db.flush()
    return unit


def unit_for_product(db: Session, product: Product, unit_id: str | None = None) -> Unit | None:
    return tenant_find(db, Unit, unit_id or product.unit_id, product.restaurant_id)


def purchase_unit_for_product(db: Session, product: Product) -> Unit | None:
    return tenant_find(db, Unit, product.purchase_unit_id, product.restaurant_id)


def get_product_or_404(db: Session, product_id: str, restaurant_id: str | None, *, for_update: bool = False) -> Product:
    if not restaurant_id:
        raise HTTPException(status_code=404, detail="Produit stock introuvable")
    return tenant_get_or_404(
        db,
        Product,
        product_id,
        restaurant_id,
        detail="Produit stock introuvable",
        for_update=for_update,
    )


def normalize_type(value: StockMovementType) -> StockMovementType:
    if value == StockMovementType.IN:
        return StockMovementType.ENTRY
    if value == StockMovementType.OUT:
        return StockMovementType.OUTPUT
    if value == StockMovementType.ADJUSTMENT:
        return StockMovementType.INVENTORY_PLUS
    return value


def dec(value) -> Decimal:
    """Convertit n'importe quelle valeur numérique en Decimal (montants/quantités stock)."""
    if value is None or value == "":
        return Decimal("0")
    return value if isinstance(value, Decimal) else Decimal(str(value))


def signed_quantity(movement: StockMovement, depot_id: str | None = None) -> Decimal:
    if movement.status != StockMovementStatus.VALIDATED:
        return Decimal("0")
    movement_type = normalize_type(movement.movement_type)
    qty = dec(movement.quantity)
    if movement_type in IN_TYPES:
        return qty if depot_id is None or movement.destination_depot_id == depot_id else Decimal("0")
    if movement_type in OUT_TYPES:
        return -qty if depot_id is None or movement.source_depot_id == depot_id else Decimal("0")
    if movement_type == StockMovementType.TRANSFER:
        if depot_id is None:
            return Decimal("0")
        if movement.destination_depot_id == depot_id:
            return qty
        if movement.source_depot_id == depot_id:
            return -qty
    return Decimal("0")


def _stock_quantity_expr(depot_id: str | None):
    """Expression SQL signée (équivalent de signed_quantity) pour SUM côté base."""
    if depot_id is None:
        # Tous dépôts : les transferts (+dest -source) se compensent -> ignorés.
        return case(
            (StockMovement.movement_type.in_(SQL_IN_TYPES), StockMovement.quantity),
            (StockMovement.movement_type.in_(SQL_OUT_TYPES), -StockMovement.quantity),
            else_=0,
        )
    return case(
        (and_(StockMovement.movement_type.in_(SQL_IN_TYPES), StockMovement.destination_depot_id == depot_id), StockMovement.quantity),
        (and_(StockMovement.movement_type.in_(SQL_OUT_TYPES), StockMovement.source_depot_id == depot_id), -StockMovement.quantity),
        (and_(StockMovement.movement_type == StockMovementType.TRANSFER, StockMovement.destination_depot_id == depot_id), StockMovement.quantity),
        (and_(StockMovement.movement_type == StockMovementType.TRANSFER, StockMovement.source_depot_id == depot_id), -StockMovement.quantity),
        else_=0,
    )


def stock_movements_support_aggregation(db: Session) -> bool:
    """Vérifie que stock_movements expose les colonnes nécessaires à l'agrégation SQL.

    Important : inspecter la **connexion de la session** (pas l'Engine). Sur SQLite
    `:memory:`, `inspect(engine)` ouvre une autre base vide et peut invalider /
    rollback la transaction courante (mouvements flushés perdus → stock à 0).
    """
    try:
        inspector = _session_inspector(db)
        if "stock_movements" not in inspector.get_table_names():
            return False
        existing = {column["name"] for column in inspector.get_columns("stock_movements")}
    except SQLAlchemyError:
        return False
    required = {
        "restaurant_id",
        "product_id",
        "movement_type",
        "quantity",
        "status",
        "source_depot_id",
        "destination_depot_id",
    }
    return required.issubset(existing)


def get_current_stock(db: Session, product_id: str, depot_id: str | None = None, restaurant_id: str | None = None) -> Decimal:
    """Stock courant d'un produit, calculé par **agrégation SQL** (pas de scan Python)."""
    if not stock_movements_support_aggregation(db):
        return Decimal("0")
    query = db.query(func.coalesce(func.sum(_stock_quantity_expr(depot_id)), 0)).filter(
        StockMovement.product_id == product_id,
        StockMovement.status == StockMovementStatus.VALIDATED,
    )
    if restaurant_id:
        query = query.filter(StockMovement.restaurant_id == restaurant_id)
    try:
        return dec(query.scalar())
    except SQLAlchemyError:
        db.rollback()
        return Decimal("0")


def stock_totals_map(db: Session, restaurant_id: str) -> dict[str, Decimal]:
    """Stock courant (tous dépôts) de TOUS les produits du restaurant en une requête (anti N+1)."""
    if not stock_movements_support_aggregation(db):
        return {}
    try:
        rows = (
            db.query(StockMovement.product_id, func.coalesce(func.sum(_stock_quantity_expr(None)), 0))
            .filter(StockMovement.restaurant_id == restaurant_id, StockMovement.status == StockMovementStatus.VALIDATED)
            .group_by(StockMovement.product_id)
            .all()
        )
    except SQLAlchemyError:
        db.rollback()
        return {}
    return {product_id: dec(total) for product_id, total in rows}


def get_product_stock_by_depot(db: Session, product: Product) -> list[ProductStockByDepot]:
    rows = []
    for depot in db.query(Depot).filter(Depot.restaurant_id == product.restaurant_id, Depot.is_active.is_(True)).all():
        quantity = get_current_stock(db, product.id, depot.id, product.restaurant_id)
        rows.append(
            ProductStockByDepot(
                depot_id=depot.id,
                depot_name=depot.name,
                depot_code=depot.code,
                quantity=quantity,
                value=quantity * dec(product.purchase_price),
            )
        )
    return rows


def product_public(
    db: Session,
    product: Product,
    *,
    total_stock: Decimal | None = None,
    include_stock_by_depot: bool = True,
) -> dict:
    unit = unit_for_product(db, product)
    purchase_unit = purchase_unit_for_product(db, product)
    stock_by_depot = get_product_stock_by_depot(db, product) if include_stock_by_depot else []
    current_stock = total_stock if total_stock is not None else get_current_stock(db, product.id, restaurant_id=product.restaurant_id)
    return {
        "id": product.id,
        "restaurant_id": product.restaurant_id,
        "code": product.code,
        "name": product.name,
        "product_type": product.product_type,
        "category_id": product.category_id,
        "unit_id": product.unit_id,
        "unit_name": unit.name if unit else None,
        "unit_symbol": unit.symbol if unit else None,
        "purchase_unit_id": product.purchase_unit_id,
        "purchase_unit_name": purchase_unit.name if purchase_unit else None,
        "purchase_factor": product.purchase_factor,
        "purchase_price": product.purchase_price,
        "minimum_stock": product.minimum_stock,
        "packaging_sale_price": product.packaging_sale_price,
        "sale_margin_rate": product.sale_margin_rate,
        "is_active": product.is_active,
        "current_stock": current_stock,
        "stock_value": current_stock * dec(product.purchase_price),
        "stock_by_depot": stock_by_depot,
        "created_at": product.created_at,
    }


def validate_movement_payload(
    db: Session,
    *,
    restaurant_id: str,
    movement_type: StockMovementType,
    product_id: str,
    quantity: float,
    source_depot_id: str | None,
    destination_depot_id: str | None,
) -> None:
    movement_type = normalize_type(movement_type)
    if quantity <= 0:
        raise HTTPException(status_code=400, detail="La quantite doit etre superieure a zero")
    if movement_type in {StockMovementType.ENTRY, StockMovementType.DIRECT_ENTRY, StockMovementType.INVENTORY_PLUS}:
        if not destination_depot_id or source_depot_id:
            raise HTTPException(status_code=400, detail="Ce mouvement exige un depot destination et aucun depot source")
    if movement_type in {StockMovementType.OUTPUT, StockMovementType.LOSS, StockMovementType.INVENTORY_MINUS}:
        if not source_depot_id or destination_depot_id:
            raise HTTPException(status_code=400, detail="Ce mouvement exige un depot source et aucun depot destination")
    if movement_type == StockMovementType.TRANSFER:
        if not source_depot_id or not destination_depot_id:
            raise HTTPException(status_code=400, detail="Un transfert exige un depot source et un depot destination")
        if source_depot_id == destination_depot_id:
            raise HTTPException(status_code=400, detail="Le depot source et le depot destination doivent etre differents")
    for depot_id in [source_depot_id, destination_depot_id]:
        if depot_id:
            depot = tenant_get_optional(db, Depot, depot_id, restaurant_id, detail="Depot introuvable")
            if not depot or not depot.is_active:
                raise HTTPException(status_code=404, detail="Depot introuvable ou inactif")
    if movement_type in {StockMovementType.OUTPUT, StockMovementType.LOSS, StockMovementType.INVENTORY_MINUS, StockMovementType.TRANSFER}:
        available = get_current_stock(db, product_id, source_depot_id, restaurant_id)
        if available < dec(quantity):
            raise HTTPException(status_code=400, detail=f"Stock insuffisant: disponible {available:g}, demande {dec(quantity):g}")


def add_movement(
    db: Session,
    *,
    restaurant_id: str,
    user_id: str,
    movement_type: StockMovementType,
    product_id: str,
    quantity: float,
    source_depot_id: str | None = None,
    destination_depot_id: str | None = None,
    unit_price: float | None = None,
    production_cost: float | None = None,
    supplier_id: str | None = None,
    reason: str | None = None,
    reference: str | None = None,
    movement_date: datetime | None = None,
    status: StockMovementStatus = StockMovementStatus.VALIDATED,
) -> StockMovement:
    product = get_product_or_404(db, product_id, restaurant_id, for_update=True)
    movement_type = normalize_type(movement_type)
    if status == StockMovementStatus.VALIDATED:
        validate_movement_payload(
            db,
            restaurant_id=restaurant_id,
            movement_type=movement_type,
            product_id=product.id,
            quantity=quantity,
            source_depot_id=source_depot_id,
            destination_depot_id=destination_depot_id,
        )
    qty = dec(quantity)
    is_purchase_entry = movement_type in {StockMovementType.ENTRY, StockMovementType.DIRECT_ENTRY} and unit_price is not None
    if is_purchase_entry:
        # Recalcul du CMUP pondéré : (qté_avant×cmup + qté_entrée×prix) / qté_totale.
        entry_price = dec(unit_price)
        qty_before = get_current_stock(db, product.id, restaurant_id=restaurant_id)
        cmup_before = product.cmup if product.cmup else dec(product.purchase_price)
        new_total = qty_before + qty
        product.cmup = (
            ((qty_before * cmup_before + qty * entry_price) / new_total).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            if new_total > 0 else entry_price
        )
        product.purchase_price = entry_price
        price = entry_price
    elif unit_price is not None:
        price = dec(unit_price)
    else:
        # Sorties / pertes / transferts : valorisées au CMUP courant (repli prix d'achat).
        price = product.cmup if product.cmup else dec(product.purchase_price)
    ensure_legacy_stock_references(
        db,
        restaurant_id=restaurant_id,
        product=product,
        source_depot_id=source_depot_id,
        destination_depot_id=destination_depot_id,
    )
    movement = StockMovement(
        restaurant_id=restaurant_id,
        movement_date=movement_date or utcnow(),
        movement_type=movement_type,
        product_id=product.id,
        source_depot_id=source_depot_id,
        destination_depot_id=destination_depot_id,
        quantity=qty,
        unit_price=price,
        total_amount=qty * price,
        production_cost=dec(production_cost) if production_cost is not None else None,
        supplier_id=supplier_id,
        reason=reason,
        reference=reference,
        status=status,
        created_by=user_id,
        validated_by=user_id if status == StockMovementStatus.VALIDATED else None,
        validated_at=utcnow() if status == StockMovementStatus.VALIDATED else None,
    )
    db.add(movement)
    db.flush()
    # Inventaire permanent : une sortie pour vente/consommation/perte décharge le stock
    # (Débit 6037 / Crédit 37 au CMUP). Les écarts d'inventaire sont gérés séparément.
    if status == StockMovementStatus.VALIDATED and movement_type in {StockMovementType.OUTPUT, StockMovementType.LOSS}:
        from app.modules.finance.router import post_stock_cogs_entry_safe

        post_stock_cogs_entry_safe(db, movement, user_id)
        # FEFO : décharge les lots du dépôt source (no-op si produit non suivi par lots).
        consume_lots_fefo(db, restaurant_id, product.id, source_depot_id, qty)
    return movement


def notify_if_low_stock(db: Session, product: Product, previous_total) -> None:
    threshold = dec(product.minimum_stock)
    if threshold <= 0:
        return
    new_total = get_current_stock(db, product.id, restaurant_id=product.restaurant_id)
    if not (new_total <= threshold < dec(previous_total)):
        return
    message = f"{product.name} est sous le seuil minimum ({new_total:g} restant, seuil {threshold:g})."
    for target_role in ("STOCK", "ADMIN", "MANAGER"):
        notify(db, title="Stock bas", message=message, restaurant_id=product.restaurant_id, role=target_role, category="stock", link="low-stock")


def get_item_or_404(db: Session, item_id: str, restaurant_id: str | None, *, for_update: bool = False) -> Product:
    product = get_product_or_404(db, item_id, restaurant_id, for_update=for_update)
    product._stock_by_location = {
        location: get_current_stock(db, product.id, depot_for_location(db, product.restaurant_id, location).id, product.restaurant_id)
        for location in StockLocation
    }
    return product


def get_location_quantity(item: Product, location: StockLocation) -> Decimal:
    return dec(getattr(item, "_stock_by_location", {}).get(location, 0))


def set_location_quantity(_item: Product, _location: StockLocation, _value: float) -> None:
    # Ancien helper conserve pour compatibilite. Le nouveau stock est derive des mouvements.
    return None


def consume_fifo(
    db: Session,
    item: Product,
    location: StockLocation,
    quantity: float,
    movement_type: StockMovementType,
    created_by_id: str | None,
    destination: str | None = None,
    note: str | None = None,
    reference: str | None = None,
):
    source = depot_for_location(db, item.restaurant_id, location)
    movement = add_movement(
        db,
        restaurant_id=item.restaurant_id,
        user_id=created_by_id or default_user_id(db, item.restaurant_id),
        movement_type=StockMovementType.LOSS if movement_type == StockMovementType.LOSS else StockMovementType.OUTPUT,
        product_id=item.id,
        source_depot_id=source.id,
        quantity=dec(quantity),
        unit_price=dec(item.purchase_price),
        reason=note or destination,
        reference=reference,
    )
    return dec(movement.total_amount), [movement], movement.id


@router.get("/summary", response_model=StockSummaryOut)
def stock_summary(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_READ)
    ensure_default_data(db, current_user.restaurant_id)
    db.commit()
    products = db.query(Product).filter(Product.restaurant_id == current_user.restaurant_id).all()
    depots = depots_by_code(db, current_user.restaurant_id)
    public_products = [product_public(db, product) for product in products]
    stock_value = sum(row["stock_value"] for row in public_products)
    main_value = sum(next((s.value for s in row["stock_by_depot"] if s.depot_code == "MAIN"), 0) for row in public_products)
    kitchen_value = sum(next((s.value for s in row["stock_by_depot"] if s.depot_code == "KITCHEN"), 0) for row in public_products)
    drink_value = sum(next((s.value for s in row["stock_by_depot"] if s.depot_code == "DRINK"), 0) for row in public_products)
    movements = []
    if stock_movements_support_aggregation(db):
        try:
            movements = db.query(StockMovement).filter(StockMovement.restaurant_id == current_user.restaurant_id).order_by(StockMovement.created_at.desc()).all()
        except SQLAlchemyError:
            db.rollback()
    entries = [m for m in movements if normalize_type(m.movement_type) in {StockMovementType.ENTRY, StockMovementType.DIRECT_ENTRY}]
    outputs = [m for m in movements if normalize_type(m.movement_type) in {StockMovementType.OUTPUT, StockMovementType.LOSS}]
    transfers = [m for m in movements if normalize_type(m.movement_type) == StockMovementType.TRANSFER]
    gaps = (
        db.query(InventoryDetail)
        .filter(InventoryDetail.restaurant_id == current_user.restaurant_id, InventoryDetail.gap_quantity != 0)
        .order_by(InventoryDetail.created_at.desc())
        .limit(5)
        .all()
    )
    loss_by_reason: dict[str, float] = {}
    for movement in outputs:
        if normalize_type(movement.movement_type) == StockMovementType.LOSS:
            key = movement.reason or "perte"
            loss_by_reason[key] = loss_by_reason.get(key, Decimal("0")) + dec(movement.total_amount)
    return StockSummaryOut(
        product_count=len(products),
        low_stock_count=len([p for p in public_products if p["current_stock"] <= p["minimum_stock"]]),
        out_of_stock_count=len([p for p in public_products if p["current_stock"] <= 0]),
        stock_value=stock_value,
        main_stock_value=main_value,
        kitchen_stock_value=kitchen_value,
        drink_stock_value=drink_value,
        total_entries_value=sum((dec(m.total_amount) for m in entries), Decimal("0")),
        total_outputs_value=sum((dec(m.total_amount) for m in outputs), Decimal("0")),
        total_damage_loss=sum((dec(m.total_amount) for m in outputs if normalize_type(m.movement_type) == StockMovementType.LOSS), Decimal("0")),
        latest_entries=entries[:5],
        latest_outputs=outputs[:5],
        latest_transfers=transfers[:5],
        latest_inventory_gaps=gaps,
        loss_by_reason=loss_by_reason,
        stock_value_by_center={depot.name: sum(s.value for row in public_products for s in row["stock_by_depot"] if s.depot_id == depot.id) for depot in depots.values()},
    )


@router.get("/products", response_model=list[ProductPublic])
@router.get("/items", response_model=list[ProductPublic])
def list_products(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_READ)
    ensure_default_data(db, current_user.restaurant_id)
    db.commit()
    products = db.query(Product).filter(Product.restaurant_id == current_user.restaurant_id).order_by(Product.created_at.desc()).all()
    totals = stock_totals_map(db, current_user.restaurant_id)
    return [product_public(db, product, total_stock=totals.get(product.id, Decimal("0"))) for product in products]


@router.post("/products", response_model=ProductPublic, status_code=201)
@router.post("/items", response_model=ProductPublic, status_code=201)
def create_product(payload: ProductIn, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_UPDATE)
    try:
        ensure_product_creation_columns(db)
        ensure_default_data(db, current_user.restaurant_id)
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Préparation du stock impossible: {exc.__class__.__name__}.") from exc
    code = payload.code.strip() if payload.code else None
    name = payload.name.strip()
    if code:
        existing_code = (
            db.query(Product)
            .filter(Product.restaurant_id == current_user.restaurant_id, Product.code == code)
            .one_or_none()
        )
        if existing_code:
            raise HTTPException(status_code=400, detail="Un produit avec ce code existe déjà.")
    existing_name = (
        db.query(Product)
        .filter(Product.restaurant_id == current_user.restaurant_id, Product.name == name)
        .one_or_none()
    )
    if existing_name:
        raise HTTPException(status_code=400, detail="Un produit avec ce nom existe déjà.")
    unit = resolve_unit(db, current_user.restaurant_id, payload.unit_id or payload.unit)
    purchase_unit = resolve_unit(db, current_user.restaurant_id, payload.purchase_unit_id) if payload.purchase_unit_id else None
    product = Product(
        restaurant_id=current_user.restaurant_id,
        code=code,
        name=name,
        product_type=payload.product_type,
        category_id=payload.category_id,
        unit_id=unit.id,
        purchase_unit_id=purchase_unit.id if purchase_unit else None,
        purchase_factor=payload.purchase_factor,
        purchase_price=0,
        cmup=0,
        minimum_stock=payload.minimum_stock,
        packaging_sale_price=payload.packaging_sale_price,
        sale_margin_rate=payload.sale_margin_rate,
        is_active=payload.is_active,
    )
    db.add(product)
    try:
        db.flush()
        log_action(db, current_user, "stock.product_create", "product", product.id, f"Creation produit stock {product.name}")
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="Création du produit impossible: code ou nom déjà utilisé.") from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Création du produit impossible: {exc.__class__.__name__}.") from exc
    db.refresh(product)
    return product_public(db, product, total_stock=Decimal("0"), include_stock_by_depot=False)


@router.get("/products/{product_id}", response_model=ProductPublic)
def product_detail(product_id: str, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_READ)
    return product_public(db, get_product_or_404(db, product_id, current_user.restaurant_id))


@router.patch("/products/{product_id}", response_model=ProductPublic)
@router.patch("/items/{product_id}", response_model=ProductPublic)
def update_product(product_id: str, payload: ProductUpdateIn, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_UPDATE)
    product = get_product_or_404(db, product_id, current_user.restaurant_id)
    data = payload.dict(exclude_unset=True)
    if "alert_threshold" in data and data["alert_threshold"] is not None:
        data["minimum_stock"] = data.pop("alert_threshold")
    if "unit" in data:
        unit_value = data.pop("unit")
        if unit_value:
            data["unit_id"] = resolve_unit(db, current_user.restaurant_id, unit_value).id
    if data.get("unit_id"):
        data["unit_id"] = resolve_unit(db, current_user.restaurant_id, data["unit_id"]).id
    if data.get("purchase_unit_id"):
        data["purchase_unit_id"] = resolve_unit(db, current_user.restaurant_id, data["purchase_unit_id"]).id
    for field, value in data.items():
        setattr(product, field, value)
    log_action(db, current_user, "stock.product_update", "product", product.id, f"Modification produit stock {product.name}")
    db.commit()
    db.refresh(product)
    return product_public(db, product)


@router.delete("/products/{product_id}", status_code=200)
def deactivate_product(product_id: str, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_UPDATE)
    product = get_product_or_404(db, product_id, current_user.restaurant_id)
    product.is_active = False
    db.commit()
    return {"message": "Produit desactive"}


@router.get("/depots", response_model=list[DepotPublic])
@router.get("/cost-centers", response_model=list[DepotPublic])
def list_depots(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_READ)
    ensure_default_data(db, current_user.restaurant_id)
    db.commit()
    depots = db.query(Depot).filter(Depot.restaurant_id == current_user.restaurant_id).order_by(Depot.created_at.asc()).all()
    unique_depots = []
    seen = set()
    for depot in depots:
        key = normalize_depot_code(depot.code) or depot.id
        if key in seen:
            continue
        seen.add(key)
        unique_depots.append(depot)
    return unique_depots


@router.post("/depots", response_model=DepotPublic, status_code=201)
def create_depot(payload: DepotIn, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_UPDATE)
    code = payload.code.strip().upper()
    exists = db.query(Depot).filter(
        Depot.restaurant_id == current_user.restaurant_id,
        Depot.code == code,
    ).first()
    if exists:
        raise HTTPException(status_code=400, detail=f"Un dépôt avec le code {code} existe déjà.")

    data = payload.model_dump()
    data["code"] = code
    data["type"] = DepotType(data["type"])
    depot = Depot(restaurant_id=current_user.restaurant_id, **data)
    db.add(depot)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="Création du dépôt impossible: code ou données déjà utilisés.") from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="Création du dépôt impossible: données invalides.") from exc
    db.refresh(depot)
    return depot


@router.patch("/depots/{depot_id}", response_model=DepotPublic)
def update_depot(depot_id: str, payload: DepotUpdateIn, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_UPDATE)
    depot = tenant_get_or_404(db, Depot, depot_id, current_user.restaurant_id, detail="Depot introuvable")
    for field, value in payload.dict(exclude_unset=True).items():
        setattr(depot, field, value)
    db.commit()
    db.refresh(depot)
    return depot


@router.delete("/depots/{depot_id}", status_code=200)
def deactivate_depot(depot_id: str, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_UPDATE)
    depot = tenant_get_or_404(db, Depot, depot_id, current_user.restaurant_id, detail="Depot introuvable")
    depot.is_active = False
    db.commit()
    return {"message": "Depot desactive"}


@router.get("/units", response_model=list[UnitPublic])
def list_units(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_READ)
    ensure_default_data(db, current_user.restaurant_id)
    db.commit()
    units = db.query(Unit).filter(Unit.restaurant_id == current_user.restaurant_id).order_by(Unit.name.asc(), Unit.created_at.asc()).all()
    unique_units = []
    seen = set()
    for unit in units:
        key = normalize_unit_key(unit.name, unit.symbol)
        symbol_key = normalize_unit_key(unit.symbol, unit.name)
        if key in seen or symbol_key in seen:
            continue
        seen.add(key)
        seen.add(symbol_key)
        unique_units.append(unit)
    return unique_units


@router.post("/units", response_model=UnitPublic, status_code=201)
def create_unit(payload: UnitIn, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_UPDATE)
    unit = Unit(restaurant_id=current_user.restaurant_id, **payload.dict())
    db.add(unit)
    db.commit()
    db.refresh(unit)
    return unit


@router.get("/categories", response_model=list[CategoryPublic])
def list_categories(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_READ)
    return db.query(StockCategory).filter(StockCategory.restaurant_id == current_user.restaurant_id).order_by(StockCategory.name.asc()).all()


@router.post("/categories", response_model=CategoryPublic, status_code=201)
def create_category(payload: CategoryIn, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_UPDATE)
    category = StockCategory(restaurant_id=current_user.restaurant_id, **payload.dict())
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.get("/suppliers", response_model=list[SupplierPublic])
def list_suppliers(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_READ)
    return db.query(Supplier).filter(Supplier.restaurant_id == current_user.restaurant_id).order_by(Supplier.name.asc()).all()


@router.post("/suppliers", response_model=SupplierPublic, status_code=201)
def create_supplier(payload: SupplierIn, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_UPDATE)
    supplier = Supplier(restaurant_id=current_user.restaurant_id, **payload.dict())
    db.add(supplier)
    db.flush()
    log_action(db, current_user, "stock.supplier_create", "supplier", supplier.id, f"Fournisseur créé: {supplier.name}")
    db.commit()
    db.refresh(supplier)
    return supplier


def conversion_factor(product: Product) -> Decimal:
    """Nombre d'unités de stock par unité d'achat (>=1 par défaut)."""
    factor = dec(product.purchase_factor) if product.purchase_factor else Decimal("1")
    return factor if factor > 0 else Decimal("1")


def compute_dish_costs(db: Session, restaurant_id: str) -> dict[str, Decimal]:
    """Coût matière unitaire par plat (menu_item_id -> Decimal).

    = Σ ingrédients (quantité/plat × CMUP) + Σ emballages (quantité requise × CMUP).
    """
    costs: dict[str, Decimal] = {}
    recipe_rows = (
        db.query(StockRecipeIngredient, Product)
        .join(Product, Product.id == StockRecipeIngredient.stock_item_id)
        .filter(StockRecipeIngredient.restaurant_id == restaurant_id, StockRecipeIngredient.is_active.is_(True))
        .all()
    )
    for link, product in recipe_rows:
        costs[link.menu_item_id] = costs.get(link.menu_item_id, Decimal("0")) + dec(link.quantity_per_dish) * dec(product.cmup_current)
    packaging_rows = (
        db.query(StockItemPackaging, Product)
        .join(Product, Product.id == StockItemPackaging.packaging_item_id)
        .filter(StockItemPackaging.restaurant_id == restaurant_id, StockItemPackaging.is_active.is_(True))
        .all()
    )
    for link, product in packaging_rows:
        costs[link.menu_item_id] = costs.get(link.menu_item_id, Decimal("0")) + dec(link.required_quantity) * dec(product.cmup_current)
    return costs


def create_stock_lot(db: Session, movement: StockMovement, *, depot_id: str, quantity, unit_cost, lot_number=None, expiry_date=None) -> StockLot:
    lot = StockLot(
        restaurant_id=movement.restaurant_id,
        product_id=movement.product_id,
        depot_id=depot_id,
        lot_number=lot_number,
        expiry_date=expiry_date,
        quantity_initial=dec(quantity),
        quantity_remaining=dec(quantity),
        unit_cost=dec(unit_cost),
        movement_id=movement.id,
    )
    db.add(lot)
    return lot


def consume_lots_fefo(db: Session, restaurant_id: str, product_id: str, depot_id: str | None, quantity) -> None:
    """Décrémente les lots du dépôt en **FEFO** (péremption la plus proche d'abord).

    No-op si le produit n'est pas suivi par lots (aucun lot) -> le ledger reste la source
    de vérité des quantités. Les lots non datés sont consommés après les lots datés.
    """
    remaining = dec(quantity)
    if remaining <= 0 or not depot_id:
        return
    lots = (
        db.query(StockLot)
        .filter(
            StockLot.restaurant_id == restaurant_id,
            StockLot.product_id == product_id,
            StockLot.depot_id == depot_id,
            StockLot.quantity_remaining > 0,
        )
        .order_by(StockLot.expiry_date.is_(None).asc(), StockLot.expiry_date.asc(), StockLot.created_at.asc())
        .all()
    )
    if not lots:
        return
    for lot in lots:
        if remaining <= 0:
            break
        available = dec(lot.quantity_remaining)
        take = available if available <= remaining else remaining
        lot.quantity_remaining = available - take
        remaining -= take


def create_stock_entry(payload: StockEntryIn, current_user: User, db: Session, movement_type: StockMovementType) -> StockMovement:
    try:
        ensure_stock_entry_columns(db)
        previous = get_current_stock(db, payload.product_id, restaurant_id=current_user.restaurant_id)
        quantity = dec(payload.quantity)
        unit_price = dec(payload.unit_price) if payload.unit_price is not None else None
        if payload.in_purchase_unit:
            # Saisie en unité d'achat (sac, casier) -> conversion en unité de stock.
            product = get_product_or_404(db, payload.product_id, current_user.restaurant_id)
            factor = conversion_factor(product)
            quantity = quantity * factor
            if unit_price is not None:
                unit_price = unit_price / factor  # prix par unité de stock (précision conservée)
        movement = add_movement(
            db,
            restaurant_id=current_user.restaurant_id,
            user_id=current_user.id,
            movement_type=movement_type,
            product_id=payload.product_id,
            destination_depot_id=payload.destination_depot_id,
            quantity=quantity,
            unit_price=unit_price,
            supplier_id=payload.supplier_id,
            reason=payload.reason,
            reference=payload.reference,
            movement_date=payload.movement_date,
        )
        if payload.lot_number or payload.expiry_date:
            create_stock_lot(
                db, movement,
                depot_id=payload.destination_depot_id,
                quantity=movement.quantity,
                unit_cost=movement.unit_price,
                lot_number=payload.lot_number,
                expiry_date=payload.expiry_date,
            )
        notify_if_low_stock(db, get_product_or_404(db, payload.product_id, current_user.restaurant_id), previous)
        from app.modules.finance.router import post_stock_reception_entry_safe

        post_stock_reception_entry_safe(db, movement, current_user.id)
        log_action(db, current_user, "stock.entry_create", "stock_movement", movement.id, "Entrée de stock")
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        message = str(getattr(exc, "orig", exc)).splitlines()[0]
        raise HTTPException(status_code=400, detail=f"Création de l'entrée impossible: contrainte base de données ({message}).") from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Création de l'entrée impossible: {exc.__class__.__name__}.") from exc
    db.refresh(movement)
    return movement


@router.post("/entries", response_model=StockMovementPublic, status_code=201)
def create_entry(payload: StockEntryIn, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_UPDATE)
    return create_stock_entry(payload, current_user, db, StockMovementType.ENTRY)


@router.post("/direct-entries", response_model=StockMovementPublic, status_code=201)
def create_direct_entry(payload: StockEntryIn, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_UPDATE)
    return create_stock_entry(payload, current_user, db, StockMovementType.DIRECT_ENTRY)


@router.post("/transfers", response_model=StockMovementPublic, status_code=201)
def create_transfer(payload: StockTransferIn, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_UPDATE)
    try:
        ensure_stock_entry_columns(db)
        movement = add_movement(db, restaurant_id=current_user.restaurant_id, user_id=current_user.id, movement_type=StockMovementType.TRANSFER, **payload.dict())
        log_action(db, current_user, "stock.transfer_create", "stock_movement", movement.id, "Transfert de stock")
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        message = str(getattr(exc, "orig", exc)).splitlines()[0]
        raise HTTPException(status_code=400, detail=f"Création du transfert impossible: contrainte base de données ({message}).") from exc
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Création du transfert impossible: {exc.__class__.__name__}.") from exc
    db.refresh(movement)
    return movement


@router.post("/outputs", response_model=StockMovementPublic, status_code=201)
def create_output(payload: StockOutputIn, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_UPDATE)
    previous = get_current_stock(db, payload.product_id, restaurant_id=current_user.restaurant_id)
    movement_type = StockMovementType.TRANSFER if payload.destination_depot_id else StockMovementType.OUTPUT
    movement = add_movement(
        db,
        restaurant_id=current_user.restaurant_id,
        user_id=current_user.id,
        movement_type=movement_type,
        product_id=payload.product_id,
        source_depot_id=payload.source_depot_id,
        destination_depot_id=payload.destination_depot_id,
        quantity=payload.quantity,
        unit_price=None,
        reason=payload.reason,
        reference=payload.reference,
        movement_date=payload.movement_date,
    )
    log_action(db, current_user, "stock.output_create", "stock_movement", movement.id, "Sortie de stock")
    notify_if_low_stock(db, get_product_or_404(db, payload.product_id, current_user.restaurant_id), previous)
    db.commit()
    db.refresh(movement)
    return movement


@router.post("/losses", response_model=StockMovementPublic, status_code=201)
@router.post("/damages", response_model=StockMovementPublic, status_code=201)
def create_loss(payload: StockOutputIn, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_UPDATE)
    previous = get_current_stock(db, payload.product_id, restaurant_id=current_user.restaurant_id)
    movement_type = StockMovementType.TRANSFER if payload.destination_depot_id else StockMovementType.LOSS
    movement = add_movement(
        db,
        restaurant_id=current_user.restaurant_id,
        user_id=current_user.id,
        movement_type=movement_type,
        product_id=payload.product_id,
        source_depot_id=payload.source_depot_id,
        destination_depot_id=payload.destination_depot_id,
        quantity=payload.quantity,
        reason=payload.reason,
        reference=payload.reference,
        movement_date=payload.movement_date,
    )
    log_action(db, current_user, "stock.loss_create", "stock_movement", movement.id, "Avarie / perte de stock")
    notify_if_low_stock(db, get_product_or_404(db, payload.product_id, current_user.restaurant_id), previous)
    db.commit()
    db.refresh(movement)
    return movement


@router.post("/movements", response_model=StockMovementPublic, status_code=201)
def create_movement(payload: StockMovementIn, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_UPDATE)
    if not payload.product_id:
        raise HTTPException(status_code=400, detail="Produit obligatoire")
    source_depot_id = payload.source_depot_id
    destination_depot_id = payload.destination_depot_id
    if payload.source_location and not source_depot_id:
        source_depot_id = depot_for_location(db, current_user.restaurant_id, payload.source_location).id
    if payload.destination_location and not destination_depot_id:
        destination_depot_id = depot_for_location(db, current_user.restaurant_id, payload.destination_location).id
    if payload.movement_type == StockMovementType.IN and not destination_depot_id:
        destination_depot_id = depot_for_location(db, current_user.restaurant_id, StockLocation.MAGASIN).id
    if payload.movement_type == StockMovementType.OUT and not source_depot_id:
        source_depot_id = depot_for_location(db, current_user.restaurant_id, StockLocation.MAGASIN).id
    movement = add_movement(
        db,
        restaurant_id=current_user.restaurant_id,
        user_id=current_user.id,
        movement_type=payload.movement_type,
        product_id=payload.product_id,
        quantity=payload.quantity,
        source_depot_id=source_depot_id,
        destination_depot_id=destination_depot_id,
        unit_price=payload.unit_price,
        production_cost=payload.production_cost,
        supplier_id=payload.supplier_id,
        reason=payload.reason,
        reference=payload.reference,
        movement_date=payload.movement_date,
        status=payload.status,
    )
    log_action(db, current_user, "stock.movement_create", "stock_movement", movement.id, "Mouvement de stock")
    db.commit()
    db.refresh(movement)
    return movement


@router.get("/movements", response_model=list[StockMovementPublic])
def list_movements(
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    depot_id: str | None = Query(default=None),
    product_id: str | None = Query(default=None),
    movement_type: StockMovementType | None = Query(default=None),
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_permission(current_user, Permission.STOCK_READ)
    if not stock_movements_support_aggregation(db):
        return []
    query = db.query(StockMovement).filter(StockMovement.restaurant_id == current_user.restaurant_id)
    if start_date:
        query = query.filter(StockMovement.movement_date >= start_date)
    if end_date:
        query = query.filter(StockMovement.movement_date <= end_date)
    if depot_id:
        query = query.filter((StockMovement.source_depot_id == depot_id) | (StockMovement.destination_depot_id == depot_id))
    if product_id:
        query = query.filter(StockMovement.product_id == product_id)
    if movement_type:
        query = query.filter(StockMovement.movement_type == movement_type)
    try:
        return query.order_by(StockMovement.movement_date.desc(), StockMovement.created_at.desc()).limit(500).all()
    except SQLAlchemyError:
        db.rollback()
        return []


@router.get("/entries", response_model=list[StockMovementPublic])
def list_entries(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_READ)
    return db.query(StockMovement).filter(StockMovement.restaurant_id == current_user.restaurant_id, StockMovement.movement_type.in_([StockMovementType.ENTRY, StockMovementType.DIRECT_ENTRY])).order_by(StockMovement.created_at.desc()).all()


@router.get("/transfers", response_model=list[StockMovementPublic])
def list_transfers(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_READ)
    return db.query(StockMovement).filter(StockMovement.restaurant_id == current_user.restaurant_id, StockMovement.movement_type == StockMovementType.TRANSFER).order_by(StockMovement.created_at.desc()).all()


@router.get("/outputs", response_model=list[StockMovementPublic])
@router.get("/damages", response_model=list[StockMovementPublic])
def list_outputs(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_READ)
    return db.query(StockMovement).filter(StockMovement.restaurant_id == current_user.restaurant_id, StockMovement.movement_type.in_([StockMovementType.OUTPUT, StockMovementType.LOSS])).order_by(StockMovement.created_at.desc()).all()


@router.patch("/movements/{movement_id}/cancel", response_model=StockMovementPublic)
def cancel_stock_movement(movement_id: str, reason: str | None = None, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_UPDATE)
    movement = tenant_get_or_404(db, StockMovement, movement_id, current_user.restaurant_id, detail="Mouvement introuvable")
    if movement.status != StockMovementStatus.VALIDATED:
        raise HTTPException(status_code=400, detail="Seul un mouvement valide peut etre annule")
    movement.status = StockMovementStatus.CANCELLED
    movement.reason = f"{movement.reason or ''}\nAnnulation controlee: {reason or 'sans motif'}".strip()
    movement.validated_by = current_user.id
    movement.validated_at = utcnow()
    db.commit()
    db.refresh(movement)
    return movement


@router.patch("/movements/{movement_id}", response_model=StockMovementPublic)
def update_stock_movement(
    movement_id: str,
    payload: StockMovementUpdateIn,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_permission(current_user, Permission.STOCK_UPDATE)
    movement = tenant_get_or_404(db, StockMovement, movement_id, current_user.restaurant_id, detail="Mouvement introuvable")
    if movement.status != StockMovementStatus.VALIDATED:
        raise HTTPException(status_code=400, detail="Seul un mouvement valide peut etre modifie")
    if payload.movement_date is not None:
        movement.movement_date = payload.movement_date
    if payload.reason is not None:
        movement.reason = payload.reason
    if payload.reference is not None:
        movement.reference = payload.reference
    if payload.destination_depot_id is not None:
        if movement.movement_type not in {StockMovementType.TRANSFER, StockMovementType.OUTPUT, StockMovementType.LOSS}:
            raise HTTPException(status_code=400, detail="La destination ne s'applique pas a ce type de mouvement")
        movement.destination_depot_id = payload.destination_depot_id or None
    movement.validated_by = current_user.id
    movement.validated_at = utcnow()
    log_action(db, current_user, "stock.movement_update", "stock_movement", movement.id, "Mise a jour mouvement stock")
    db.commit()
    db.refresh(movement)
    return movement


@router.get("/global-stock", response_model=list[ProductPublic])
def get_global_stock(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    return list_products(current_user, db)


@router.get("/depots/{depot_id}/stock", response_model=list[DepotStockRow])
def get_depot_stock(depot_id: str, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_READ)
    depot = tenant_get_or_404(db, Depot, depot_id, current_user.restaurant_id, detail="Depot introuvable")
    products = db.query(Product).filter(Product.restaurant_id == current_user.restaurant_id, Product.is_active.is_(True)).all()
    rows = []
    for product in products:
        unit = unit_for_product(db, product)
        quantity = get_current_stock(db, product.id, depot.id, current_user.restaurant_id)
        if quantity <= 0:
            continue
        unit_cost = product.cmup if product.cmup else dec(product.purchase_price)
        rows.append(DepotStockRow(product_id=product.id, product_name=product.name, unit=unit.symbol if unit else "", quantity=quantity, value=quantity * unit_cost, minimum_stock=product.minimum_stock))
    return rows


@router.get("/low-stock", response_model=list[ProductPublic])
def get_low_stock_products(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_READ)
    products = [product_public(db, p) for p in db.query(Product).filter(Product.restaurant_id == current_user.restaurant_id, Product.is_active.is_(True)).all()]
    return [product for product in products if product["current_stock"] <= product["minimum_stock"]]


@router.get("/lots")
def list_lots(product_id: str | None = None, depot_id: str | None = None, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    """Lots de stock encore disponibles (quantité restante > 0)."""
    assert_permission(current_user, Permission.STOCK_READ)
    if "stock_lots" not in _session_inspector(db).get_table_names():
        return []
    query = db.query(StockLot).filter(StockLot.restaurant_id == current_user.restaurant_id, StockLot.quantity_remaining > 0)
    if product_id:
        query = query.filter(StockLot.product_id == product_id)
    if depot_id:
        query = query.filter(StockLot.depot_id == depot_id)
    try:
        return query.order_by(StockLot.expiry_date.is_(None).asc(), StockLot.expiry_date.asc()).limit(500).all()
    except SQLAlchemyError:
        db.rollback()
        return []


@router.get("/lots/expiring")
def get_expiring_lots(days: int = Query(default=7, ge=0, le=365), current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    """Lots périmés ou périmant dans les `days` jours (quantité restante > 0)."""
    assert_permission(current_user, Permission.STOCK_READ)
    now = utcnow()
    limit_date = now + timedelta(days=days)
    lots = (
        db.query(StockLot)
        .filter(
            StockLot.restaurant_id == current_user.restaurant_id,
            StockLot.quantity_remaining > 0,
            StockLot.expiry_date.isnot(None),
            StockLot.expiry_date <= limit_date,
        )
        .order_by(StockLot.expiry_date.asc())
        .all()
    )
    return [
        {
            "id": lot.id,
            "product_id": lot.product_id,
            "depot_id": lot.depot_id,
            "lot_number": lot.lot_number,
            "expiry_date": lot.expiry_date,
            "quantity_remaining": lot.quantity_remaining,
            "expired": lot.expiry_date < now,
        }
        for lot in lots
    ]


@router.post("/inventories", response_model=InventoryPublic, status_code=201)
def create_inventory(payload: InventoryCreateIn, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_UPDATE)
    ensure_default_data(db, current_user.restaurant_id)
    depot_id = payload.depot_id or depot_for_location(db, current_user.restaurant_id, StockLocation.MAGASIN).id
    depot = tenant_get_or_404(db, Depot, depot_id, current_user.restaurant_id, detail="Depot introuvable")
    inventory = Inventory(
        restaurant_id=current_user.restaurant_id,
        inventory_date=payload.inventory_date or utcnow(),
        depot_id=depot.id,
        observation=payload.observation or payload.period,
        created_by=current_user.id,
    )
    db.add(inventory)
    db.flush()
    details = payload.details
    if not details:
        products_in_depot = []
        for product in db.query(Product).filter(Product.restaurant_id == current_user.restaurant_id, Product.is_active.is_(True)).all():
            quantity = get_current_stock(db, product.id, depot.id, current_user.restaurant_id)
            if quantity > 0:
                products_in_depot.append(type("Detail", (), {"product_id": product.id, "real_quantity": quantity, "justification": None}))
        details = [
            detail
            for detail in products_in_depot
        ]
    for detail in details:
        theoretical = get_current_stock(db, detail.product_id, depot.id, current_user.restaurant_id)
        real = dec(detail.real_quantity)
        gap = theoretical - real
        tolerance = Decimal("0")
        exceeds = abs(gap) > tolerance
        justification = (getattr(detail, "justification", None) or "").strip() or None
        if exceeds and not justification:
            raise HTTPException(status_code=400, detail="Une justification est obligatoire pour chaque écart d'inventaire.")
        product = get_product_or_404(db, detail.product_id, current_user.restaurant_id)
        unit_cost = product.cmup if product.cmup else dec(product.purchase_price)
        db.add(InventoryDetail(
            restaurant_id=current_user.restaurant_id,
            inventory_id=inventory.id,
            product_id=detail.product_id,
            theoretical_quantity=theoretical,
            real_quantity=real,
            gap_quantity=gap,
            value_gap=gap * unit_cost,
            exceeds_tolerance=exceeds,
            tolerance_threshold=tolerance,
            justification=justification,
        ))
    log_action(db, current_user, "stock.inventory_create", "inventory", inventory.id, "Inventaire créé")
    db.commit()
    db.refresh(inventory)
    return inventory_public(db, inventory)


def inventory_public(db: Session, inventory: Inventory) -> dict:
    details = db.query(InventoryDetail).filter(InventoryDetail.inventory_id == inventory.id).all()
    return {
        "id": inventory.id,
        "restaurant_id": inventory.restaurant_id,
        "inventory_date": inventory.inventory_date,
        "depot_id": inventory.depot_id,
        "status": inventory.status,
        "observation": inventory.observation,
        "created_by": inventory.created_by,
        "validated_by": inventory.validated_by,
        "validated_at": inventory.validated_at,
        "created_at": inventory.created_at,
        "details": details,
        "lines": details,
    }


@router.get("/inventories", response_model=list[InventoryPublic])
def list_inventories(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_READ)
    inventories = db.query(Inventory).filter(Inventory.restaurant_id == current_user.restaurant_id).order_by(Inventory.inventory_date.desc()).all()
    return [inventory_public(db, inventory) for inventory in inventories]


@router.patch("/inventories/{inventory_id}/lines/{line_id}", response_model=InventoryDetailPublic)
def update_inventory_line(inventory_id: str, line_id: str, payload: InventoryLineUpdateIn, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_UPDATE)
    inventory = tenant_get_or_404(db, Inventory, inventory_id, current_user.restaurant_id, detail="Inventaire introuvable")
    if inventory.status != InventoryStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Inventaire introuvable ou non modifiable")
    line = tenant_get_or_404(db, InventoryDetail, line_id, current_user.restaurant_id, detail="Ligne inventaire introuvable")
    if line.inventory_id != inventory.id:
        raise HTTPException(status_code=404, detail="Ligne inventaire introuvable")
    line.real_quantity = dec(payload.real_stock)
    line.gap_quantity = dec(line.theoretical_quantity) - dec(payload.real_stock)
    product = get_product_or_404(db, line.product_id, current_user.restaurant_id)
    unit_cost = product.cmup if product.cmup else dec(product.purchase_price)
    line.value_gap = dec(line.gap_quantity) * unit_cost
    line.exceeds_tolerance = abs(dec(line.gap_quantity)) > dec(line.tolerance_threshold)
    line.justification = (payload.justification or "").strip() or None
    if line.exceeds_tolerance and not line.justification:
        raise HTTPException(status_code=400, detail="Justification obligatoire pour un écart d'inventaire.")
    db.commit()
    db.refresh(line)
    return line


@router.patch("/inventories/{inventory_id}/validate", response_model=InventoryPublic)
@router.patch("/inventories/{inventory_id}/close", response_model=InventoryPublic)
def validate_inventory(inventory_id: str, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_UPDATE)
    inventory = tenant_get_or_404(db, Inventory, inventory_id, current_user.restaurant_id, detail="Inventaire introuvable")
    if inventory.status != InventoryStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Inventaire deja traite")
    details = db.query(InventoryDetail).filter(InventoryDetail.inventory_id == inventory.id).all()
    for detail in details:
        if detail.exceeds_tolerance and not (detail.justification or "").strip():
            raise HTTPException(status_code=400, detail="Justification obligatoire avant clôture pour les écarts d'inventaire.")
        if detail.gap_quantity < 0:
            add_movement(db, restaurant_id=current_user.restaurant_id, user_id=current_user.id, movement_type=StockMovementType.INVENTORY_PLUS, product_id=detail.product_id, destination_depot_id=inventory.depot_id, quantity=abs(detail.gap_quantity), reason=f"Ajustement inventaire {inventory.id}", reference=inventory.id)
        elif detail.gap_quantity > 0:
            add_movement(db, restaurant_id=current_user.restaurant_id, user_id=current_user.id, movement_type=StockMovementType.INVENTORY_MINUS, product_id=detail.product_id, source_depot_id=inventory.depot_id, quantity=detail.gap_quantity, reason=f"Ajustement inventaire {inventory.id}", reference=inventory.id)
    inventory.status = InventoryStatus.VALIDATED
    inventory.validated_by = current_user.id
    inventory.validated_at = utcnow()

    from decimal import Decimal

    from app.modules.finance.router import post_inventory_adjustment_entry_safe

    product_ids = [detail.product_id for detail in details]
    costs = {
        product.id: (product.cmup if product.cmup else product.purchase_price)
        for product in db.query(Product).filter(Product.id.in_(product_ids)).all()
    } if product_ids else {}
    net_amount = sum(
        (-Decimal(str(detail.gap_quantity or 0)) * Decimal(str(costs.get(detail.product_id, 0) or 0)) for detail in details),
        Decimal("0"),
    )
    post_inventory_adjustment_entry_safe(
        db,
        current_user.restaurant_id,
        source_id=inventory.id,
        reference=inventory.id,
        entry_date=inventory.inventory_date,
        net_amount=net_amount,
        user_id=current_user.id,
    )

    log_action(db, current_user, "stock.inventory_close", "inventory", inventory.id, "Inventaire clôturé")
    db.commit()
    db.refresh(inventory)
    return inventory_public(db, inventory)


@router.get("/reports", response_model=StockReportOut)
def get_stock_movements_report(
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    depot_id: str | None = Query(default=None),
    product_id: str | None = Query(default=None),
    category_id: str | None = Query(default=None),
    movement_type: StockMovementType | None = Query(default=None),
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_permission(current_user, Permission.STOCK_READ)
    end = end_date or utcnow()
    start = start_date or (end - timedelta(days=7))
    movements = []
    if stock_movements_support_aggregation(db):
        query = db.query(StockMovement).join(Product, Product.id == StockMovement.product_id).filter(StockMovement.restaurant_id == current_user.restaurant_id, StockMovement.movement_date >= start, StockMovement.movement_date <= end)
        if depot_id:
            query = query.filter((StockMovement.source_depot_id == depot_id) | (StockMovement.destination_depot_id == depot_id))
        if product_id:
            query = query.filter(StockMovement.product_id == product_id)
        if category_id:
            query = query.filter(Product.category_id == category_id)
        if movement_type:
            query = query.filter(StockMovement.movement_type == movement_type)
        try:
            movements = query.order_by(StockMovement.movement_date.desc()).all()
        except SQLAlchemyError:
            db.rollback()
    all_products = db.query(Product).filter(Product.restaurant_id == current_user.restaurant_id, Product.is_active.is_(True)).all()
    if depot_id:
        depot_rows = get_depot_stock(depot_id, current_user, db)
        depot_quantities = {row.product_id: dec(row.quantity) for row in depot_rows}
        products = [
            product_public(db, product, total_stock=depot_quantities.get(product.id, Decimal("0")))
            for product in all_products
            if product.id in depot_quantities
        ]
        stock_value = sum(dec(row.value) for row in depot_rows)
    else:
        products = [product_public(db, p) for p in all_products]
        stock_value = sum(product["stock_value"] for product in products)
    entries = sum((dec(m.total_amount) for m in movements if normalize_type(m.movement_type) in {StockMovementType.ENTRY, StockMovementType.DIRECT_ENTRY, StockMovementType.INVENTORY_PLUS}), Decimal("0"))
    outputs = sum((dec(m.total_amount) for m in movements if normalize_type(m.movement_type) in OUT_TYPES), Decimal("0"))
    return StockReportOut(
        start_date=start,
        end_date=end,
        entries_value=entries,
        outputs_value=outputs,
        damage_loss=sum((dec(m.total_amount) for m in movements if normalize_type(m.movement_type) == StockMovementType.LOSS), Decimal("0")),
        stock_value=stock_value,
        estimated_sales_value=sum((product["stock_value"] * (1 + dec(product["sale_margin_rate"]) / 100) for product in products), Decimal("0")),
        estimated_profit=max(Decimal("0"), sum((product["stock_value"] * (dec(product["sale_margin_rate"]) / 100) for product in products), Decimal("0"))),
        low_stock_count=len([product for product in products if product["current_stock"] <= product["minimum_stock"]]),
        movement_count=len(movements),
        movements=movements,
    )


@router.post("/reports/export-audit", status_code=204)
def audit_stock_export(payload: ExportAuditIn, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_READ)
    log_action(db, current_user, "stock.report_export", "stock_report", payload.report_type, f"Export {payload.format} - {payload.report_type}")
    db.commit()
    return None


@router.get("/menu-items", response_model=list[StockMenuItemOut])
def list_menu_items_for_stock(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_READ)
    return db.query(MenuItem).filter(MenuItem.restaurant_id == current_user.restaurant_id).order_by(MenuItem.name.asc()).all()


@router.get("/packaging-links", response_model=list[PackagingLinkPublic])
def list_packaging_links(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_READ)
    return db.query(StockItemPackaging).filter(StockItemPackaging.restaurant_id == current_user.restaurant_id, StockItemPackaging.is_active.is_(True)).order_by(StockItemPackaging.created_at.desc()).all()


@router.post("/packaging-links", response_model=PackagingLinkPublic, status_code=201)
def create_packaging_link(payload: PackagingLinkIn, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_UPDATE)
    get_product_or_404(db, payload.packaging_item_id, current_user.restaurant_id)
    link = StockItemPackaging(restaurant_id=current_user.restaurant_id, **payload.dict())
    db.add(link)
    db.commit()
    db.refresh(link)
    return link


@router.delete("/packaging-links/{link_id}", status_code=200)
def archive_packaging_link(link_id: str, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_UPDATE)
    link = tenant_get_or_404(db, StockItemPackaging, link_id, current_user.restaurant_id, detail="Liaison introuvable")
    link.is_active = False
    db.commit()
    return {"message": "Liaison archivee"}


@router.get("/recipes", response_model=list[RecipeIngredientPublic])
def list_recipe_links(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_READ)
    return db.query(StockRecipeIngredient).filter(StockRecipeIngredient.restaurant_id == current_user.restaurant_id, StockRecipeIngredient.is_active.is_(True)).order_by(StockRecipeIngredient.created_at.desc()).all()


@router.post("/recipes", response_model=RecipeIngredientPublic, status_code=201)
def create_recipe_link(payload: RecipeIngredientIn, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_UPDATE)
    get_product_or_404(db, payload.stock_item_id, current_user.restaurant_id)
    link = StockRecipeIngredient(restaurant_id=current_user.restaurant_id, **payload.dict())
    db.add(link)
    db.commit()
    db.refresh(link)
    return link


@router.delete("/recipes/{link_id}", status_code=200)
def delete_recipe_link(link_id: str, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_UPDATE)
    link = tenant_get_or_404(db, StockRecipeIngredient, link_id, current_user.restaurant_id, detail="Liaison introuvable")
    link.is_active = False
    db.commit()
    return {"message": "Liaison archivee"}


@router.get("/production-sheets", response_model=list[ProductionSheetPublic])
def list_production_sheets(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_READ)
    return db.query(StockProductionSheet).filter(StockProductionSheet.restaurant_id == current_user.restaurant_id).order_by(StockProductionSheet.created_at.desc()).all()


@router.post("/production-sheets", response_model=ProductionSheetPublic, status_code=201)
def create_production_sheet(payload: ProductionSheetIn, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.STOCK_UPDATE)
    dish = tenant_get_or_404(db, MenuItem, payload.menu_item_id, current_user.restaurant_id, detail="Plat introuvable")
    links = db.query(StockRecipeIngredient).filter(StockRecipeIngredient.restaurant_id == current_user.restaurant_id, StockRecipeIngredient.menu_item_id == payload.menu_item_id, StockRecipeIngredient.is_active.is_(True)).all()
    if not links:
        raise HTTPException(status_code=400, detail="Aucun ingredient lie a ce plat")
    for link in links:
        product = get_item_or_404(db, link.stock_item_id, current_user.restaurant_id, for_update=True)
        consume_fifo(db, product, link.location, link.quantity_per_dish * payload.quantity, StockMovementType.OUTPUT, current_user.id, "Production cuisine", f"Fiche production: {payload.quantity} x {dish.name}")
    sheet = StockProductionSheet(restaurant_id=current_user.restaurant_id, menu_item_id=payload.menu_item_id, quantity=payload.quantity, note=payload.note, created_by_id=current_user.id)
    db.add(sheet)
    db.flush()
    log_action(db, current_user, "stock.production_sheet_create", "production_sheet", sheet.id, "Fiche de production créée")
    db.commit()
    db.refresh(sheet)
    return sheet
