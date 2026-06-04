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
    is_active: bool = True
    created_by_id: Optional[str] = None
    created_at: datetime


class PromotionCodeIn(BaseModel):
    code: str = Field(min_length=2, max_length=40)
    label: str = Field(min_length=2, max_length=160)
    discount_type: str = Field(default="PERCENT", pattern="^(PERCENT|FIXED)$")
    discount_value: float = Field(gt=0)
    min_order_amount: float = Field(default=0, ge=0)
    max_discount_amount: Optional[float] = Field(default=None, gt=0)
    max_uses: Optional[int] = Field(default=None, gt=0)
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    is_active: bool = True


class PromotionCodeUpdateIn(BaseModel):
    code: Optional[str] = Field(default=None, min_length=2, max_length=40)
    label: Optional[str] = Field(default=None, min_length=2, max_length=160)
    discount_type: Optional[str] = Field(default=None, pattern="^(PERCENT|FIXED)$")
    discount_value: Optional[float] = Field(default=None, gt=0)
    min_order_amount: Optional[float] = Field(default=None, ge=0)
    max_discount_amount: Optional[float] = Field(default=None, gt=0)
    max_uses: Optional[int] = Field(default=None, gt=0)
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    is_active: Optional[bool] = None


class PromotionCodePublic(OrmModel):
    id: str
    restaurant_id: str
    code: str
    label: str
    discount_type: str
    discount_value: float
    min_order_amount: float
    max_discount_amount: Optional[float] = None
    max_uses: Optional[int] = None
    used_count: int
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    is_active: bool
    created_at: datetime


class PromoQuoteIn(BaseModel):
    code: str = Field(min_length=2, max_length=40)
    order_amount: float = Field(ge=0)


class PromoQuoteOut(BaseModel):
    code: str
    label: str
    discount_amount: float
    final_amount: float


class PaymentPublic(BaseModel):
    id: str
    order_number: str
    customer_name: str
    payment_method: str
<<<<<<< HEAD
    payment_status: str = "En attente"
    transaction_id: Optional[str] = None
=======
>>>>>>> 12ae8a7538e7247857354f2c0c441e94a0eb39cf
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


class ServerRevenueOut(BaseModel):
    server_id: str | None = None
    server_name: str
    orders_count: int
    paid_orders_count: int
    revenue: float
    discounts: float
    average_ticket: float
    first_order_at: datetime | None = None
    last_order_at: datetime | None = None


class IncomeStatementOut(BaseModel):
    revenue: float
    discounts: float
    net_revenue: float
    expenses: float
    damage_loss: float
    gross_profit: float
    net_profit: float


class CashFlowStatementOut(BaseModel):
    cash_in: float
    cash_out: float
    net_cash_flow: float
    by_payment_method: dict[str, float]


class BalanceSheetOut(BaseModel):
    assets: dict[str, float]
    liabilities: dict[str, float]
    equity: dict[str, float]


class LedgerEntryOut(BaseModel):
    date: datetime
    account: str
    label: str
    debit: float
    credit: float
    reference: str | None = None


class FinancialStatementOut(BaseModel):
    report: FinanceSummaryOut
    income_statement: IncomeStatementOut
    cash_flow: CashFlowStatementOut
    balance_sheet: BalanceSheetOut
    ledger: list[LedgerEntryOut]
    margins: list[DishMarginOut]
    rotation: list[StockRotationOut]
    expenses: list[ExpensePublic]
    payments: list[PaymentPublic]
<<<<<<< HEAD

    
=======
>>>>>>> 12ae8a7538e7247857354f2c0c441e94a0eb39cf
