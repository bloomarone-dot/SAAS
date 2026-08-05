from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.modules.shared.schemas import OrmModel


class PublicOrderItemIn(BaseModel):
    menu_item_id: str
    quantity: int = Field(ge=1, le=50)


class PublicOrderCreateIn(BaseModel):
    customer_name: str = Field(min_length=2, max_length=160)
    customer_phone: str = Field(min_length=5, max_length=40)
    customer_address: Optional[str] = Field(default=None, max_length=255)
    notes: Optional[str] = None
    fulfillment_type: str = Field(default="Livraison", max_length=40)
    payment_method: str = Field(default="Paiement à la livraison", max_length=40)
    delivery_area_id: Optional[str] = None
    items: list[PublicOrderItemIn] = Field(min_length=1)


class CashierDeliveryCreateIn(BaseModel):
    customer_name: str = Field(min_length=2, max_length=160)
    customer_phone: str = Field(min_length=5, max_length=40)
    customer_address: Optional[str] = Field(default=None, max_length=255)
    delivery_area_id: str = Field(min_length=1)
    payment_method: str = Field(default="Dépôt Orange Money", max_length=40)
    notes: Optional[str] = None
    items: list[PublicOrderItemIn] = Field(min_length=1)


class OrderItemUpdateIn(BaseModel):
    menu_item_id: str
    quantity: int = Field(ge=1, le=50)


class OrderStatusUpdateIn(BaseModel):
    status: str = Field(min_length=2, max_length=40)


class CashierPaymentIn(BaseModel):
    payment_method: str = Field(min_length=2, max_length=80)
    discount_amount: Optional[float] = Field(default=None, ge=0)
    cash_register_id: Optional[str] = None
    cash_amount: Optional[float] = Field(default=None, ge=0)
    mobile_amount: Optional[float] = Field(default=None, ge=0)
    mobile_operator: Optional[str] = Field(default=None, max_length=20)


class OrderReopenIn(BaseModel):
    """Réouverture d'une commande fermée : motif obligatoire (anti-fraude)."""
    reason: str = Field(min_length=5, max_length=255, description="Motif justifiant la réouverture")


class PromoApplyIn(BaseModel):
    code: str = Field(min_length=2, max_length=40)


class OrderUpdateIn(BaseModel):
    customer_name: Optional[str] = Field(default=None, min_length=2, max_length=160)
    customer_phone: Optional[str] = Field(default=None, min_length=5, max_length=40)
    customer_address: Optional[str] = Field(default=None, max_length=255)
    notes: Optional[str] = None
    status: Optional[str] = Field(default=None, min_length=2, max_length=40)
    fulfillment_type: Optional[str] = Field(default=None, max_length=40)
    payment_method: Optional[str] = Field(default=None, max_length=40)
    discount_amount: Optional[float] = Field(default=None, ge=0)
    delivery_fee: Optional[float] = Field(default=None, ge=0)
    delivery_area_id: Optional[str] = None
    items: Optional[list[OrderItemUpdateIn]] = None


class OrderDeleteIn(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=255)


class OrderCashAssignmentIn(BaseModel):
    cash_register_id: str
    assigned_cashier_id: Optional[str] = None


class OrderItemPublic(OrmModel):
    id: str
    menu_item_id: Optional[str] = None
    stock_item_id: Optional[str] = None
    name: str
    sale_channel: str = "REPAS"
    quantity: int
    unit_price: float
    line_total: float


class OrderPublic(OrmModel):
    id: str
    restaurant_id: str
    branch_id: Optional[str] = None
    table_id: Optional[int] = None
    server_id: Optional[str] = None
    cashier_id: Optional[str] = None
    created_by_cashier_id: Optional[str] = None
    cash_register_id: Optional[str] = None
    assigned_cashier_id: Optional[str] = None
    assignment_status: str = "UNASSIGNED"
    assigned_at: Optional[datetime] = None
    delivery_area_id: Optional[str] = None
    delivery_area_name: Optional[str] = None
    party_size: int = 1
    order_number: str
    customer_name: str
    customer_phone: str
    customer_address: Optional[str] = None
    notes: Optional[str] = None
    status: str
    fulfillment_type: str
    order_source: Optional[str] = None
    server_name: Optional[str] = None
    cashier_name: Optional[str] = None
    created_by_cashier_name: Optional[str] = None
    assigned_cashier_name: Optional[str] = None
    order_taker_name: Optional[str] = None
    table_name: Optional[str] = None
    table_room: Optional[str] = None
    payment_method: str
    payment_status: str = "En attente"
    transaction_id: Optional[str] = None
    payment_locked: bool = False
    is_closed: bool = False
    closed_at: Optional[datetime] = None
    discount_amount: float
    delivery_fee: float
    cash_paid_amount: Optional[float] = None
    mobile_paid_amount: Optional[float] = None
    total_amount: float
    cancelled_at: Optional[datetime] = None
    paid_at: Optional[datetime] = None
    printed_at: Optional[datetime] = None
    print_count: int = 0
    deleted_at: Optional[datetime] = None
    deleted_by: Optional[str] = None
    delete_reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    # Suivi cuisine (agrege depuis les tickets) — visible serveur / caisse / admin.
    kitchen_sent_at: Optional[datetime] = None
    kitchen_started_at: Optional[datetime] = None
    kitchen_ready_at: Optional[datetime] = None
    kitchen_served_at: Optional[datetime] = None
    kitchen_wait_minutes: Optional[int] = None
    kitchen_prep_minutes: Optional[int] = None
    kitchen_ready_wait_minutes: Optional[int] = None
    kitchen_total_minutes: Optional[int] = None
    items: list[OrderItemPublic] = Field(default_factory=list)


class CashierDiscountLine(BaseModel):
    order_id: str
    order_number: str
    discount_amount: float
    total_amount: float
    server_name: Optional[str] = None
    cashier_name: Optional[str] = None
    paid_at: Optional[datetime] = None


class CashierReportOut(BaseModel):
    start_date: datetime
    end_date: datetime
    pending_orders_count: int
    paid_orders_count: int
    receipts_count: int
    total_collected: float
    total_delivery_fees: float = 0
    total_discounts: float = 0
    discounted_orders_count: int = 0
    discount_lines: list[CashierDiscountLine] = Field(default_factory=list)
    average_ticket: float
    by_payment_method: dict[str, float]
    pending_orders: list[OrderPublic] = Field(default_factory=list)
    receipts: list[OrderPublic] = Field(default_factory=list)
    analytics: Optional["CashierReportAnalytics"] = None


class CashierPaymentBreakdown(BaseModel):
    method: str
    amount: float
    percentage: float = 0


class CashierBranchPerformance(BaseModel):
    branch_id: Optional[str] = None
    branch_name: str
    revenue: float
    transactions: int
    average_ticket: float
    comparison_yesterday: Optional[float] = None
    comparison_last_week: Optional[float] = None
    comparison_last_month: Optional[float] = None
    rank: int = 0


class CashierRestaurantPerformance(BaseModel):
    restaurant_id: str
    restaurant_name: str
    revenue: float
    transactions: int
    average_ticket: float
    comparison_yesterday: Optional[float] = None
    comparison_last_week: Optional[float] = None
    comparison_last_month: Optional[float] = None
    rank: int = 0


class CashierCashierPerformance(BaseModel):
    cashier_id: Optional[str] = None
    cashier_name: str
    branch_name: Optional[str] = None
    transactions: int
    amount_collected: float
    cancellations: int = 0
    variance: float = 0


class CashierHourlyPoint(BaseModel):
    hour: int
    transactions: int
    revenue: float


class CashierVarianceLine(BaseModel):
    label: str
    amount: float
    reason: str
    created_at: datetime


class CashierReportAlert(BaseModel):
    level: str
    title: str
    message: str


class CashierReportAnalytics(BaseModel):
    restaurants_count: int = 1
    theoretical_amount: float = 0
    declared_amount: float = 0
    variance_amount: float = 0
    global_variance: float = 0
    payment_breakdown: list[CashierPaymentBreakdown] = Field(default_factory=list)
    branch_performance: list[CashierBranchPerformance] = Field(default_factory=list)
    restaurant_performance: list[CashierRestaurantPerformance] = Field(default_factory=list)
    cashier_performance: list[CashierCashierPerformance] = Field(default_factory=list)
    hourly_sales: list[CashierHourlyPoint] = Field(default_factory=list)
    cancelled_transactions: int = 0
    refunded_transactions: int = 0
    variance_history: list[CashierVarianceLine] = Field(default_factory=list)
    comparisons: dict[str, Optional[float]] = Field(default_factory=dict)
    alerts: list[CashierReportAlert] = Field(default_factory=list)


class CashierNetworkReportOut(BaseModel):
    start_date: datetime
    end_date: datetime
    total_collected: float
    paid_orders_count: int
    average_ticket: float
    analytics: CashierReportAnalytics


class CashDrawerOpenIn(BaseModel):
    opening_float: float = Field(ge=0)
    notes: Optional[str] = Field(default=None, max_length=255)


class CashDrawerCloseIn(BaseModel):
    closing_counted: float = Field(ge=0)
    notes: Optional[str] = Field(default=None, max_length=255)


class CashDrawerSessionOut(BaseModel):
    id: Optional[str] = None
    business_date: date
    status: str = "NONE"
    opening_float: float = 0
    closing_counted: Optional[float] = None
    opening_notes: Optional[str] = None
    closing_notes: Optional[str] = None
    opened_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    opened_by_name: Optional[str] = None
    closed_by_name: Optional[str] = None
    sales_total: float = 0
    cash_sales: float = 0
    mobile_sales: float = 0
    card_sales: float = 0
    expected_in_drawer: float = 0
    expected_day_total: float = 0
    variance: Optional[float] = None
    paid_orders_count: int = 0
