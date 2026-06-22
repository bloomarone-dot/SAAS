from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, model_validator

from app.modules.shared.schemas import OrmModel
from app.modules.stock.models import (
    DepotType,
    InventoryStatus,
    StockLocation,
    StockLossReason,
    StockMovementStatus,
    StockMovementType,
    StockProductType,
)

NAME_PATTERN = r"^[A-Za-zÀ-ÖØ-öø-ÿ0-9][A-Za-zÀ-ÖØ-öø-ÿ0-9 \.,'’\(\)\&\/\-]{1,159}$"


class DepotPublic(OrmModel):
    id: str
    restaurant_id: str
    name: str
    code: str
    type: DepotType
    description: Optional[str] = None
    is_active: bool
    created_at: datetime


class DepotIn(BaseModel):
    name: str = Field(min_length=2, max_length=160, pattern=NAME_PATTERN)
    code: str = Field(min_length=2, max_length=40)
    type: DepotType = DepotType.AUTRE
    description: Optional[str] = None
    is_active: bool = True


class DepotUpdateIn(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=160, pattern=NAME_PATTERN)
    code: Optional[str] = Field(default=None, min_length=2, max_length=40)
    type: Optional[DepotType] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class UnitPublic(OrmModel):
    id: str
    restaurant_id: str
    name: str
    symbol: str
    created_at: datetime


class UnitIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    symbol: str = Field(min_length=1, max_length=20)


class CategoryPublic(OrmModel):
    id: str
    restaurant_id: str
    name: str
    description: Optional[str] = None
    created_at: datetime


class CategoryIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: Optional[str] = None


class SupplierPublic(OrmModel):
    id: str
    restaurant_id: str
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    is_active: bool
    created_at: datetime


class SupplierIn(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    phone: Optional[str] = Field(default=None, max_length=40)
    email: Optional[str] = Field(default=None, max_length=160)
    address: Optional[str] = None
    is_active: bool = True


class ProductStockByDepot(BaseModel):
    depot_id: str
    depot_name: str
    depot_code: str
    quantity: float
    value: float


class ProductPublic(OrmModel):
    id: str
    restaurant_id: str
    code: Optional[str] = None
    name: str
    product_type: StockProductType = StockProductType.INGREDIENT
    category_id: Optional[str] = None
    unit_id: str
    unit_name: Optional[str] = None
    unit_symbol: Optional[str] = None
    purchase_price: float
    minimum_stock: float
    packaging_sale_price: float = 0
    sale_margin_rate: float = 0
    is_active: bool = True
    current_stock: float = 0
    stock_value: float = 0
    stock_by_depot: list[ProductStockByDepot] = Field(default_factory=list)
    created_at: datetime

    @property
    def unit(self) -> str:
        return self.unit_name or self.unit_symbol or ""

    @property
    def alert_threshold(self) -> float:
        return self.minimum_stock

    @property
    def quantity(self) -> float:
        return self.current_stock

    @property
    def kitchen_quantity(self) -> float:
        return 0

    @property
    def drink_quantity(self) -> float:
        return 0


class ProductIn(BaseModel):
    code: Optional[str] = Field(default=None, max_length=60)
    name: str = Field(min_length=2, max_length=160, pattern=NAME_PATTERN)
    product_type: StockProductType = StockProductType.INGREDIENT
    category_id: Optional[str] = None
    unit_id: Optional[str] = None
    unit: Optional[str] = None
    purchase_price: float = Field(default=0, ge=0)
    minimum_stock: float = Field(default=0, ge=0)
    alert_threshold: Optional[float] = Field(default=None, ge=0)
    packaging_sale_price: float = Field(default=0, ge=0)
    sale_margin_rate: float = Field(default=0, ge=0)
    is_active: bool = True

    @model_validator(mode="after")
    def normalize_threshold(self):
        if self.alert_threshold is not None:
            self.minimum_stock = self.alert_threshold
        return self


class ProductUpdateIn(BaseModel):
    code: Optional[str] = Field(default=None, max_length=60)
    name: Optional[str] = Field(default=None, min_length=2, max_length=160, pattern=NAME_PATTERN)
    product_type: Optional[StockProductType] = None
    category_id: Optional[str] = None
    unit_id: Optional[str] = None
    unit: Optional[str] = None
    purchase_price: Optional[float] = Field(default=None, ge=0)
    minimum_stock: Optional[float] = Field(default=None, ge=0)
    alert_threshold: Optional[float] = Field(default=None, ge=0)
    packaging_sale_price: Optional[float] = Field(default=None, ge=0)
    sale_margin_rate: Optional[float] = Field(default=None, ge=0)
    is_active: Optional[bool] = None


class StockMovementPublic(OrmModel):
    id: str
    restaurant_id: str
    movement_date: datetime
    movement_type: StockMovementType
    product_id: str
    source_depot_id: Optional[str] = None
    destination_depot_id: Optional[str] = None
    quantity: float
    unit_price: Optional[float] = None
    total_amount: Optional[float] = None
    supplier_id: Optional[str] = None
    reason: Optional[str] = None
    reference: Optional[str] = None
    status: StockMovementStatus
    created_by: Optional[str] = None
    validated_by: Optional[str] = None
    validated_at: Optional[datetime] = None
    created_at: datetime

    @property
    def item_id(self) -> str:
        return self.product_id

    @property
    def value(self) -> float:
        return float(self.total_amount or 0)


class StockMovementIn(BaseModel):
    movement_date: Optional[datetime] = None
    movement_type: StockMovementType
    product_id: Optional[str] = None
    item_id: Optional[str] = None
    source_depot_id: Optional[str] = None
    destination_depot_id: Optional[str] = None
    source_location: Optional[StockLocation] = None
    destination_location: Optional[StockLocation] = None
    quantity: float = Field(gt=0)
    unit_price: Optional[float] = Field(default=None, ge=0)
    supplier_id: Optional[str] = None
    reason: Optional[str] = None
    reference: Optional[str] = None
    status: StockMovementStatus = StockMovementStatus.VALIDATED
    destination: Optional[str] = None
    note: Optional[str] = None

    @model_validator(mode="after")
    def normalize_legacy_fields(self):
        if not self.product_id and self.item_id:
            self.product_id = self.item_id
        if not self.reason:
            self.reason = self.note or self.destination
        return self


class StockEntryIn(BaseModel):
    movement_date: Optional[datetime] = None
    product_id: str
    destination_depot_id: str
    quantity: float = Field(gt=0)
    unit_price: Optional[float] = Field(default=None, ge=0)
    supplier_id: Optional[str] = None
    reason: Optional[str] = None
    reference: Optional[str] = None


class StockTransferIn(BaseModel):
    movement_date: Optional[datetime] = None
    product_id: str
    source_depot_id: str
    destination_depot_id: str
    quantity: float = Field(gt=0)
    reason: Optional[str] = None
    reference: Optional[str] = None


class StockOutputIn(BaseModel):
    movement_date: Optional[datetime] = None
    product_id: str
    source_depot_id: str
    quantity: float = Field(gt=0)
    reason: str = Field(default=StockLossReason.CONSOMMATION.value, max_length=255)
    reference: Optional[str] = None


class InventoryDetailIn(BaseModel):
    product_id: str
    real_quantity: float = Field(ge=0)


class InventoryCreateIn(BaseModel):
    inventory_date: Optional[datetime] = None
    depot_id: Optional[str] = None
    period: Optional[str] = None
    observation: Optional[str] = None
    details: list[InventoryDetailIn] = Field(default_factory=list)


class InventoryDetailPublic(OrmModel):
    id: str
    restaurant_id: str
    inventory_id: str
    product_id: str
    theoretical_quantity: float
    real_quantity: float
    gap_quantity: float
    created_at: datetime


class InventoryPublic(OrmModel):
    id: str
    restaurant_id: str
    inventory_date: datetime
    depot_id: str
    status: InventoryStatus
    observation: Optional[str] = None
    created_by: str
    validated_by: Optional[str] = None
    validated_at: Optional[datetime] = None
    created_at: datetime
    details: list[InventoryDetailPublic] = Field(default_factory=list)
    lines: list[InventoryDetailPublic] = Field(default_factory=list)


class InventoryLineUpdateIn(BaseModel):
    real_stock: float = Field(ge=0)


class StockSummaryOut(BaseModel):
    product_count: int
    low_stock_count: int
    out_of_stock_count: int = 0
    stock_value: float
    main_stock_value: float
    kitchen_stock_value: float
    drink_stock_value: float
    total_entries_value: float
    total_outputs_value: float
    total_damage_loss: float
    latest_entries: list[StockMovementPublic] = Field(default_factory=list)
    latest_outputs: list[StockMovementPublic] = Field(default_factory=list)
    latest_transfers: list[StockMovementPublic] = Field(default_factory=list)
    latest_inventory_gaps: list[InventoryDetailPublic] = Field(default_factory=list)
    food_cost_percent: float = 0
    packaging_consumed_value: float = 0
    expiring_lots_count: int = 0
    loss_by_reason: dict[str, float] = Field(default_factory=dict)
    stock_value_by_center: dict[str, float] = Field(default_factory=dict)


class DepotStockRow(BaseModel):
    product_id: str
    product_name: str
    unit: str
    quantity: float
    value: float
    minimum_stock: float


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
    movements: list[StockMovementPublic] = Field(default_factory=list)


class PackagingLinkPublic(OrmModel):
    id: str
    restaurant_id: str
    menu_item_id: str
    packaging_item_id: str
    required_quantity: float
    is_active: bool
    created_at: datetime


class PackagingLinkIn(BaseModel):
    menu_item_id: str
    packaging_item_id: str
    required_quantity: float = Field(default=1, gt=0)


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


class StockMenuItemOut(OrmModel):
    id: str
    name: str
    price: float


# Alias historiques.
StockItemPublic = ProductPublic
StockItemIn = ProductIn
StockItemUpdateIn = ProductUpdateIn
StockDamagePublic = StockMovementPublic
StockDamageIn = StockOutputIn
StockCostCenterPublic = DepotPublic
StockLotPublic = BaseModel
InventoryLinePublic = InventoryDetailPublic
