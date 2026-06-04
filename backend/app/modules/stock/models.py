import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.modules.shared.models import new_id


class StockMovementType(str, enum.Enum):
    IN = "IN"
    OUT = "OUT"
    TRANSFER = "TRANSFER"
    ADJUSTMENT = "ADJUSTMENT"


class StockLocation(str, enum.Enum):
    MAGASIN = "MAGASIN"
    CUISINE = "CUISINE"
    BOISSON = "BOISSON"


class StockProductType(str, enum.Enum):
    INGREDIENT = "INGREDIENT"
    BOISSON = "BOISSON"
    EMBALLAGE = "EMBALLAGE"


class StockCostCenterType(str, enum.Enum):
    MAGASIN = "MAGASIN"
    CUISINE = "CUISINE"
    BOISSON = "BOISSON"


class StockLossReason(str, enum.Enum):
    PERIME = "PERIME"
    VOL_COULAGE = "VOL_COULAGE"
    CASSE_PREPARATION = "CASSE_PREPARATION"
    OFFERT_GESTE = "OFFERT_GESTE"
    ECART_INVENTAIRE = "ECART_INVENTAIRE"


class StockInventoryStatus(str, enum.Enum):
    OPEN = "OPEN"
    CLOSED = "CLOSED"


class StockItem(Base):
    __tablename__ = "stock_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    product_type: Mapped[StockProductType] = mapped_column(
        Enum(StockProductType), default=StockProductType.INGREDIENT, nullable=False
    )
    unit: Mapped[str] = mapped_column(String(30), default="Unité", nullable=False)
    # `quantity` represente le stock magasin principal.
    quantity: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    kitchen_quantity: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    drink_quantity: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    alert_threshold: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    purchase_price: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    cmup_current: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    packaging_sale_price: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sale_margin_rate: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class StockMovement(Base):
    __tablename__ = "stock_movements"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True, nullable=False)
    item_id: Mapped[str] = mapped_column(String(36), ForeignKey("stock_items.id"), index=True, nullable=False)
    cost_center_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("stock_cost_centers.id"), index=True, nullable=True)
    lot_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("stock_lots.id"), index=True, nullable=True)
    movement_type: Mapped[StockMovementType] = mapped_column(Enum(StockMovementType), nullable=False)
    source_location: Mapped[StockLocation | None] = mapped_column(Enum(StockLocation), nullable=True)
    destination_location: Mapped[StockLocation | None] = mapped_column(Enum(StockLocation), nullable=True)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    unit_price: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    value: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    valuation_delta: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    reference: Mapped[str | None] = mapped_column(String(120), nullable=True)
    destination: Mapped[str | None] = mapped_column(String(120), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class StockDamage(Base):
    __tablename__ = "stock_damages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True, nullable=False)
    item_id: Mapped[str] = mapped_column(String(36), ForeignKey("stock_items.id"), index=True, nullable=False)
    cost_center_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("stock_cost_centers.id"), index=True, nullable=True)
    lot_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("stock_lots.id"), index=True, nullable=True)
    location: Mapped[StockLocation] = mapped_column(Enum(StockLocation), default=StockLocation.MAGASIN, nullable=False)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    cmup_applied: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    estimated_loss: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    reason: Mapped[str] = mapped_column(String(255), nullable=False)
    created_by_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    accounted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class StockRecipeIngredient(Base):
    __tablename__ = "stock_recipe_ingredients"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True, nullable=False)
    menu_item_id: Mapped[str] = mapped_column(String(36), ForeignKey("menu_items.id"), index=True, nullable=False)
    stock_item_id: Mapped[str] = mapped_column(String(36), ForeignKey("stock_items.id"), index=True, nullable=False)
    quantity_per_dish: Mapped[float] = mapped_column(Float, nullable=False)
    location: Mapped[StockLocation] = mapped_column(Enum(StockLocation), default=StockLocation.CUISINE, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class StockCostCenter(Base):
    __tablename__ = "stock_cost_centers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    code: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    center_type: Mapped[StockCostCenterType] = mapped_column(Enum(StockCostCenterType), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class StockLot(Base):
    __tablename__ = "stock_lots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True, nullable=False)
    item_id: Mapped[str] = mapped_column(String(36), ForeignKey("stock_items.id"), index=True, nullable=False)
    cost_center_id: Mapped[str] = mapped_column(String(36), ForeignKey("stock_cost_centers.id"), index=True, nullable=False)
    entry_date: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True, nullable=False)
    expiration_date: Mapped[datetime | None] = mapped_column(DateTime, index=True, nullable=True)
    initial_quantity: Mapped[float] = mapped_column(Float, nullable=False)
    available_quantity: Mapped[float] = mapped_column(Float, index=True, nullable=False)
    purchase_unit_price: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    cmup_applied: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    stock_value: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class StockItemPackaging(Base):
    __tablename__ = "stock_item_packagings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True, nullable=False)
    menu_item_id: Mapped[str] = mapped_column(String(36), ForeignKey("menu_items.id"), index=True, nullable=False)
    packaging_item_id: Mapped[str] = mapped_column(String(36), ForeignKey("stock_items.id"), index=True, nullable=False)
    required_quantity: Mapped[float] = mapped_column(Float, default=1, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class StockInventory(Base):
    __tablename__ = "stock_inventories"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True, nullable=False)
    period: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[StockInventoryStatus] = mapped_column(Enum(StockInventoryStatus), default=StockInventoryStatus.OPEN, index=True, nullable=False)
    tolerance_rate: Mapped[float] = mapped_column(Float, default=2, nullable=False)
    opened_by_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    closed_by_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    opened_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class StockInventoryLine(Base):
    __tablename__ = "stock_inventory_lines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True, nullable=False)
    inventory_id: Mapped[str] = mapped_column(String(36), ForeignKey("stock_inventories.id"), index=True, nullable=False)
    item_id: Mapped[str] = mapped_column(String(36), ForeignKey("stock_items.id"), index=True, nullable=False)
    cost_center_id: Mapped[str] = mapped_column(String(36), ForeignKey("stock_cost_centers.id"), index=True, nullable=False)
    theoretical_stock: Mapped[float] = mapped_column(Float, nullable=False)
    real_stock: Mapped[float | None] = mapped_column(Float, nullable=True)
    variance: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    variance_value: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    exceeds_threshold: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class StockProductionSheet(Base):
    __tablename__ = "stock_production_sheets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True, nullable=False)
    menu_item_id: Mapped[str] = mapped_column(String(36), ForeignKey("menu_items.id"), index=True, nullable=False)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
