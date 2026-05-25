from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.modules.shared.schemas import OrmModel
from app.modules.stock.models import StockLocation, StockMovementType, StockProductType


class StockItemPublic(OrmModel):
    id: str
    restaurant_id: str
    name: str
    product_type: StockProductType
    unit: str
    quantity: float
    kitchen_quantity: float
    drink_quantity: float
    alert_threshold: float
    purchase_price: float
    sale_margin_rate: float
    created_at: datetime


class StockItemIn(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    product_type: StockProductType = StockProductType.INGREDIENT
    unit: str = Field(default="Kilogramme", max_length=30)
    quantity: float = Field(default=0, ge=0)
    kitchen_quantity: float = Field(default=0, ge=0)
    drink_quantity: float = Field(default=0, ge=0)
    alert_threshold: float = Field(default=0, ge=0)
    purchase_price: float = Field(default=0, ge=0)
    sale_margin_rate: float = Field(default=0, ge=0)


class StockItemUpdateIn(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=160)
    product_type: Optional[StockProductType] = None
    unit: Optional[str] = Field(default=None, max_length=30)
    quantity: Optional[float] = Field(default=None, ge=0)
    kitchen_quantity: Optional[float] = Field(default=None, ge=0)
    drink_quantity: Optional[float] = Field(default=None, ge=0)
    alert_threshold: Optional[float] = Field(default=None, ge=0)
    purchase_price: Optional[float] = Field(default=None, ge=0)
    sale_margin_rate: Optional[float] = Field(default=None, ge=0)


class StockMovementPublic(OrmModel):
    id: str
    restaurant_id: str
    item_id: str
    movement_type: StockMovementType
    source_location: Optional[StockLocation] = None
    destination_location: Optional[StockLocation] = None
    quantity: float
    unit_price: float
    destination: Optional[str] = None
    note: Optional[str] = None
    created_at: datetime


class StockMovementIn(BaseModel):
    item_id: str
    movement_type: StockMovementType
    source_location: Optional[StockLocation] = None
    destination_location: Optional[StockLocation] = None
    quantity: float = Field(gt=0)
    unit_price: float = Field(default=0, ge=0)
    destination: Optional[str] = Field(default=None, max_length=120)
    note: Optional[str] = None


class StockDamagePublic(OrmModel):
    id: str
    restaurant_id: str
    item_id: str
    location: StockLocation
    quantity: float
    estimated_loss: float
    reason: str
    accounted_at: Optional[datetime] = None
    created_at: datetime


class StockDamageIn(BaseModel):
    item_id: str
    location: StockLocation = StockLocation.MAGASIN
    quantity: float = Field(gt=0)
    estimated_loss: float = Field(default=0, ge=0)
    reason: str = Field(min_length=2, max_length=255)


class StockSummaryOut(BaseModel):
    product_count: int
    low_stock_count: int
    stock_value: float
    main_stock_value: float
    kitchen_stock_value: float
    drink_stock_value: float
    total_entries_value: float
    total_outputs_value: float
    total_damage_loss: float


class RecipeIngredientPublic(OrmModel):
    id: str
    restaurant_id: str
    menu_item_id: str
    stock_item_id: str
    quantity_per_dish: float
    location: StockLocation
    created_at: datetime


class RecipeIngredientIn(BaseModel):
    menu_item_id: str
    stock_item_id: str
    quantity_per_dish: float = Field(gt=0)
    location: StockLocation = StockLocation.CUISINE


class ProductionSheetPublic(OrmModel):
    id: str
    restaurant_id: str
    menu_item_id: str
    quantity: float
    note: Optional[str] = None
    created_by_id: Optional[str] = None
    created_at: datetime


class ProductionSheetIn(BaseModel):
    menu_item_id: str
    quantity: float = Field(gt=0)
    note: Optional[str] = None


class StockReportOut(BaseModel):
    start_date: datetime
    end_date: datetime
    entries_value: float
    outputs_value: float
    damage_loss: float
    stock_value: float
    estimated_sales_value: float
    estimated_profit: float
    low_stock_count: int
    movement_count: int


class StockMenuItemOut(OrmModel):
    id: str
    name: str
    price: float
