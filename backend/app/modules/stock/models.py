import enum
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.modules.shared.models import new_id, utcnow

# Types monétaires/quantités en Decimal (jamais Float pour des montants/stocks).
Money = Numeric(14, 2)   # montants FCFA
Qty = Numeric(14, 3)     # quantités (kg, L, pièces fractionnaires)
Rate = Numeric(7, 4)     # taux (marge…)


class DepotType(str, enum.Enum):
    PRINCIPAL = "principal"
    CUISINE = "cuisine"
    BOISSON = "boisson"
    AUTRE = "autre"


class StockLocation(str, enum.Enum):
    MAGASIN = "MAGASIN"
    CUISINE = "CUISINE"
    BOISSON = "BOISSON"


class StockProductType(str, enum.Enum):
    INGREDIENT = "INGREDIENT"
    BOISSON = "BOISSON"
    EMBALLAGE = "EMBALLAGE"


class StockMovementType(str, enum.Enum):
    ENTRY = "ENTRY"
    DIRECT_ENTRY = "DIRECT_ENTRY"
    TRANSFER = "TRANSFER"
    OUTPUT = "OUTPUT"
    LOSS = "LOSS"
    INVENTORY_PLUS = "INVENTORY_PLUS"
    INVENTORY_MINUS = "INVENTORY_MINUS"
    CANCELLATION = "CANCELLATION"
    # Compatibilite d'entree API uniquement: ces valeurs sont normalisees dans le service.
    IN = "IN"
    OUT = "OUT"
    ADJUSTMENT = "ADJUSTMENT"


class StockMovementStatus(str, enum.Enum):
    DRAFT = "draft"
    VALIDATED = "validated"
    CANCELLED = "cancelled"


class InventoryStatus(str, enum.Enum):
    DRAFT = "draft"
    VALIDATED = "validated"
    CANCELLED = "cancelled"


class StockLossReason(str, enum.Enum):
    CONSOMMATION = "consommation"
    VENTE = "vente"
    PERTE = "perte"
    CASSE = "casse"
    PERIME = "perime"
    AVARIE = "avarie"
    AUTRE = "autre"
    ECART_INVENTAIRE = "ecart_inventaire"


class Depot(Base):
    __tablename__ = "depots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    code: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    type: Mapped[DepotType] = mapped_column(Enum(DepotType), default=DepotType.AUTRE, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)


class StockCategory(Base):
    __tablename__ = "categories"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)


class Unit(Base):
    __tablename__ = "units"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    symbol: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)


class Supplier(Base):
    __tablename__ = "suppliers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(40), nullable=True)
    email: Mapped[str | None] = mapped_column(String(160), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)


class Product(Base):
    __tablename__ = "products"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True, nullable=False)
    code: Mapped[str | None] = mapped_column(String(60), index=True, nullable=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    product_type: Mapped[StockProductType] = mapped_column(Enum(StockProductType), default=StockProductType.INGREDIENT, nullable=False)
    category_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("categories.id"), nullable=True)
    unit_id: Mapped[str] = mapped_column(String(36), ForeignKey("units.id"), nullable=False)
    # Conversion multi-unités : l'article est acheté en `purchase_unit` (ex. sac, casier),
    # 1 unité d'achat = `purchase_factor` unités de stock (ex. 1 sac = 50 kg).
    purchase_unit_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("units.id"), nullable=True)
    purchase_factor: Mapped[Decimal] = mapped_column(Numeric(14, 4), default=1, nullable=False)
    purchase_price: Mapped[Decimal] = mapped_column(Money, default=0, nullable=False)
    cmup: Mapped[Decimal] = mapped_column(Money, default=0, nullable=False)
    minimum_stock: Mapped[Decimal] = mapped_column(Qty, default=0, nullable=False)
    packaging_sale_price: Mapped[Decimal] = mapped_column(Money, default=0, nullable=False)
    sale_margin_rate: Mapped[Decimal] = mapped_column(Rate, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    @property
    def unit(self) -> str:
        return ""

    @property
    def alert_threshold(self) -> float:
        return float(self.minimum_stock or 0)

    @property
    def cmup_current(self) -> Decimal:
        """Coût moyen unitaire pondéré courant (repli sur le prix d'achat si non initialisé)."""
        return self.cmup if self.cmup else (self.purchase_price or Decimal("0"))

    @property
    def quantity(self) -> float:
        return 0

    @quantity.setter
    def quantity(self, _value: float) -> None:
        return None

    @property
    def kitchen_quantity(self) -> float:
        return 0

    @kitchen_quantity.setter
    def kitchen_quantity(self, _value: float) -> None:
        return None

    @property
    def drink_quantity(self) -> float:
        return 0

    @drink_quantity.setter
    def drink_quantity(self, _value: float) -> None:
        return None


class StockMovement(Base):
    __tablename__ = "stock_movements"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True, nullable=False)
    movement_date: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True, nullable=False)
    movement_type: Mapped[StockMovementType] = mapped_column(Enum(StockMovementType), index=True, nullable=False)
    product_id: Mapped[str] = mapped_column(String(36), ForeignKey("products.id"), index=True, nullable=False)
    item_id_legacy: Mapped[str | None] = mapped_column("item_id", String(36), index=True, nullable=True)
    cost_center_id: Mapped[str | None] = mapped_column(String(36), index=True, nullable=True)
    lot_id: Mapped[str | None] = mapped_column(String(36), index=True, nullable=True)
    source_depot_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("depots.id"), index=True, nullable=True)
    destination_depot_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("depots.id"), index=True, nullable=True)
    quantity: Mapped[Decimal] = mapped_column(Qty, nullable=False)
    unit_price: Mapped[Decimal | None] = mapped_column(Money, nullable=True)
    total_amount: Mapped[Decimal | None] = mapped_column(Money, nullable=True)
    production_cost: Mapped[Decimal | None] = mapped_column(Money, nullable=True)
    value_legacy: Mapped[Decimal] = mapped_column("value", Money, default=0, nullable=False)
    valuation_delta: Mapped[Decimal] = mapped_column(Money, default=0, nullable=False)
    supplier_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("suppliers.id"), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    reference: Mapped[str | None] = mapped_column(String(160), nullable=True)
    status: Mapped[StockMovementStatus] = mapped_column(Enum(StockMovementStatus), default=StockMovementStatus.VALIDATED, index=True, nullable=False)
    created_by_id_legacy: Mapped[str | None] = mapped_column("created_by_id", String(36), ForeignKey("users.id"), nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    validated_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    validated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    cancelled_movement_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("stock_movements.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    def __init__(self, **kwargs):
        legacy_item_id = kwargs.pop("item_id", None)
        legacy_value = kwargs.pop("value", None)
        legacy_note = kwargs.pop("note", None)
        legacy_destination = kwargs.pop("destination", None)
        legacy_created_by = kwargs.pop("created_by_id", None)
        legacy_cost_center_id = kwargs.pop("cost_center_id", None)
        legacy_lot_id = kwargs.pop("lot_id", None)
        kwargs.pop("source_location", None)
        kwargs.pop("destination_location", None)
        legacy_valuation_delta = kwargs.pop("valuation_delta", None)
        if legacy_item_id and "product_id" not in kwargs:
            kwargs["product_id"] = legacy_item_id
        if legacy_item_id and "item_id_legacy" not in kwargs:
            kwargs["item_id_legacy"] = legacy_item_id
        elif kwargs.get("product_id") and "item_id_legacy" not in kwargs:
            kwargs["item_id_legacy"] = kwargs["product_id"]
        if legacy_value is not None and "total_amount" not in kwargs:
            kwargs["total_amount"] = legacy_value
        if legacy_value is not None and "value_legacy" not in kwargs:
            kwargs["value_legacy"] = legacy_value
        elif kwargs.get("total_amount") is not None and "value_legacy" not in kwargs:
            kwargs["value_legacy"] = kwargs["total_amount"]
        if legacy_created_by and "created_by" not in kwargs:
            kwargs["created_by"] = legacy_created_by
        if legacy_created_by and "created_by_id_legacy" not in kwargs:
            kwargs["created_by_id_legacy"] = legacy_created_by
        elif kwargs.get("created_by") and "created_by_id_legacy" not in kwargs:
            kwargs["created_by_id_legacy"] = kwargs["created_by"]
        if legacy_cost_center_id and "cost_center_id" not in kwargs:
            kwargs["cost_center_id"] = legacy_cost_center_id
        elif "cost_center_id" not in kwargs:
            kwargs["cost_center_id"] = kwargs.get("destination_depot_id") or kwargs.get("source_depot_id")
        if legacy_lot_id and "lot_id" not in kwargs:
            kwargs["lot_id"] = legacy_lot_id
        if legacy_valuation_delta is not None and "valuation_delta" not in kwargs:
            kwargs["valuation_delta"] = legacy_valuation_delta
        if (legacy_note or legacy_destination) and "reason" not in kwargs:
            kwargs["reason"] = legacy_note or legacy_destination
        if "movement_date" not in kwargs:
            kwargs["movement_date"] = utcnow()
        if "status" not in kwargs:
            kwargs["status"] = StockMovementStatus.VALIDATED
        if "valuation_delta" not in kwargs:
            kwargs["valuation_delta"] = Decimal("0")
        if kwargs.get("status") == StockMovementStatus.VALIDATED and "validated_at" not in kwargs:
            kwargs["validated_at"] = utcnow()
        super().__init__(**kwargs)

    @property
    def item_id(self) -> str:
        return self.product_id

    @property
    def value(self) -> float:
        return float(self.total_amount or 0)


class Inventory(Base):
    __tablename__ = "inventories"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True, nullable=False)
    inventory_date: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    depot_id: Mapped[str] = mapped_column(String(36), ForeignKey("depots.id"), index=True, nullable=False)
    status: Mapped[InventoryStatus] = mapped_column(Enum(InventoryStatus), default=InventoryStatus.DRAFT, index=True, nullable=False)
    observation: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    validated_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    validated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)


class InventoryDetail(Base):
    __tablename__ = "inventory_details"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True, nullable=False)
    inventory_id: Mapped[str] = mapped_column(String(36), ForeignKey("inventories.id"), index=True, nullable=False)
    product_id: Mapped[str] = mapped_column(String(36), ForeignKey("products.id"), index=True, nullable=False)
    theoretical_quantity: Mapped[Decimal] = mapped_column(Qty, nullable=False)
    real_quantity: Mapped[Decimal] = mapped_column(Qty, nullable=False)
    gap_quantity: Mapped[Decimal] = mapped_column(Qty, nullable=False)
    value_gap: Mapped[Decimal] = mapped_column(Money, default=0, nullable=False)
    exceeds_tolerance: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    tolerance_threshold: Mapped[Decimal] = mapped_column(Qty, default=0, nullable=False)
    justification: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)


class StockRecipeIngredient(Base):
    __tablename__ = "stock_recipe_ingredients"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True, nullable=False)
    menu_item_id: Mapped[str] = mapped_column(String(36), ForeignKey("menu_items.id"), index=True, nullable=False)
    stock_item_id: Mapped[str] = mapped_column(String(36), ForeignKey("products.id"), index=True, nullable=False)
    quantity_per_dish: Mapped[Decimal] = mapped_column(Qty, nullable=False)
    location: Mapped[StockLocation] = mapped_column(Enum(StockLocation), default=StockLocation.CUISINE, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)


class StockItemPackaging(Base):
    __tablename__ = "stock_item_packagings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True, nullable=False)
    menu_item_id: Mapped[str] = mapped_column(String(36), ForeignKey("menu_items.id"), index=True, nullable=False)
    packaging_item_id: Mapped[str] = mapped_column(String(36), ForeignKey("products.id"), index=True, nullable=False)
    required_quantity: Mapped[Decimal] = mapped_column(Qty, default=1, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)


class StockProductionSheet(Base):
    __tablename__ = "stock_production_sheets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True, nullable=False)
    menu_item_id: Mapped[str] = mapped_column(String(36), ForeignKey("menu_items.id"), index=True, nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Qty, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)


# Compatibilite imports historiques.
StockItem = Product
StockInventory = Inventory
StockInventoryLine = InventoryDetail
StockInventoryStatus = InventoryStatus
StockDamage = StockMovement
StockCostCenter = Depot
StockCostCenterType = DepotType


class StockLot(Base):
    """Lot de stock avec date de péremption (DLC/DLUO) pour la logique FEFO."""

    __tablename__ = "stock_lots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True, nullable=False)
    product_id: Mapped[str] = mapped_column(String(36), ForeignKey("products.id"), index=True, nullable=False)
    item_id_legacy: Mapped[str | None] = mapped_column("item_id", String(36), index=True, nullable=True)
    depot_id: Mapped[str] = mapped_column(String(36), ForeignKey("depots.id"), index=True, nullable=False)
    cost_center_id: Mapped[str | None] = mapped_column(String(36), index=True, nullable=True)
    entry_date: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True, nullable=False)
    lot_number: Mapped[str | None] = mapped_column(String(80), nullable=True)
    expiry_date: Mapped[datetime | None] = mapped_column(DateTime, index=True, nullable=True)
    expiration_date: Mapped[datetime | None] = mapped_column(DateTime, index=True, nullable=True)
    quantity_initial: Mapped[Decimal] = mapped_column(Qty, nullable=False)
    quantity_remaining: Mapped[Decimal] = mapped_column(Qty, index=True, nullable=False)
    unit_cost: Mapped[Decimal] = mapped_column(Money, default=0, nullable=False)
    initial_quantity: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    available_quantity: Mapped[float] = mapped_column(Float, default=0, index=True, nullable=False)
    purchase_unit_price: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    cmup_applied: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    stock_value: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    movement_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    def __init__(self, **kwargs):
        if kwargs.get("product_id") and "item_id_legacy" not in kwargs:
            kwargs["item_id_legacy"] = kwargs["product_id"]
        if kwargs.get("depot_id") and "cost_center_id" not in kwargs:
            kwargs["cost_center_id"] = kwargs["depot_id"]
        if "entry_date" not in kwargs:
            kwargs["entry_date"] = utcnow()
        if kwargs.get("expiry_date") and "expiration_date" not in kwargs:
            kwargs["expiration_date"] = kwargs["expiry_date"]
        quantity_initial = _stock_decimal(kwargs.get("quantity_initial", Decimal("0")))
        quantity_remaining = _stock_decimal(kwargs.get("quantity_remaining", quantity_initial))
        unit_cost = _stock_decimal(kwargs.get("unit_cost", Decimal("0")))
        if "initial_quantity" not in kwargs:
            kwargs["initial_quantity"] = float(quantity_initial)
        if "available_quantity" not in kwargs:
            kwargs["available_quantity"] = float(quantity_remaining)
        if "purchase_unit_price" not in kwargs:
            kwargs["purchase_unit_price"] = float(unit_cost)
        if "cmup_applied" not in kwargs:
            kwargs["cmup_applied"] = float(unit_cost)
        if "stock_value" not in kwargs:
            kwargs["stock_value"] = float(quantity_remaining * unit_cost)
        super().__init__(**kwargs)


def _stock_decimal(value) -> Decimal:
    return value if isinstance(value, Decimal) else Decimal(str(value or 0))
