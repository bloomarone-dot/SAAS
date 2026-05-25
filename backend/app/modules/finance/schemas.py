from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.modules.shared.schemas import OrmModel


class ExpenseIn(BaseModel):
    label: str = Field(min_length=2, max_length=160)
    category: str = Field(default="General", min_length=2, max_length=80)
    amount: float = Field(gt=0)
    payment_method: Optional[str] = Field(default=None, max_length=80)
    reference: Optional[str] = Field(default=None, max_length=120)
    note: Optional[str] = None
    expense_date: Optional[datetime] = None


class ExpenseUpdateIn(BaseModel):
    label: Optional[str] = Field(default=None, min_length=2, max_length=160)
    category: Optional[str] = Field(default=None, min_length=2, max_length=80)
    amount: Optional[float] = Field(default=None, gt=0)
    payment_method: Optional[str] = Field(default=None, max_length=80)
    reference: Optional[str] = Field(default=None, max_length=120)
    note: Optional[str] = None
    expense_date: Optional[datetime] = None


class ExpensePublic(OrmModel):
    id: str
    restaurant_id: str
    label: str
    category: str
    amount: float
    payment_method: Optional[str] = None
    reference: Optional[str] = None
    note: Optional[str] = None
    expense_date: datetime
    created_by_id: Optional[str] = None
    created_at: datetime


class PaymentPublic(BaseModel):
    id: str
    order_number: str
    customer_name: str
    payment_method: str
    amount: float
    status: str
    created_at: datetime


class FinanceSummaryOut(BaseModel):
    start_date: datetime
    end_date: datetime
    revenue: float
    expenses: float
    damage_loss: float
    stock_value: float
    gross_profit: float
    net_profit: float
    orders_count: int
    paid_orders_count: int
    average_order_value: float


class DishMarginOut(BaseModel):
    menu_item_id: str | None
    name: str
    quantity_sold: int
    revenue: float
    estimated_cost: float
    estimated_margin: float
    margin_rate: float


class StockRotationOut(BaseModel):
    menu_item_id: str | None
    name: str
    quantity_sold: int
    revenue: float
    last_order_at: datetime | None = None

class FinancialStatementOut(BaseModel):
    report: FinanceSummaryOut
    margins: list[DishMarginOut]
    rotation: list[StockRotationOut]
    expenses: list[ExpensePublic]
    payments: list[PaymentPublic]

