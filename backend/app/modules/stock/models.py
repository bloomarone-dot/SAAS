import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, Float, ForeignKey, String, Text
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
    movement_type: Mapped[StockMovementType] = mapped_column(Enum(StockMovementType), nullable=False)
    source_location: Mapped[StockLocation | None] = mapped_column(Enum(StockLocation), nullable=True)
    destination_location: Mapped[StockLocation | None] = mapped_column(Enum(StockLocation), nullable=True)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    unit_price: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    destination: Mapped[str | None] = mapped_column(String(120), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class StockDamage(Base):
    __tablename__ = "stock_damages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True, nullable=False)
    item_id: Mapped[str] = mapped_column(String(36), ForeignKey("stock_items.id"), index=True, nullable=False)
    location: Mapped[StockLocation] = mapped_column(Enum(StockLocation), default=StockLocation.MAGASIN, nullable=False)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    estimated_loss: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    reason: Mapped[str] = mapped_column(String(255), nullable=False)
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
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class StockProductionSheet(Base):
    __tablename__ = "stock_production_sheets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True, nullable=False)
    menu_item_id: Mapped[str] = mapped_column(String(36), ForeignKey("menu_items.id"), index=True, nullable=False)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
