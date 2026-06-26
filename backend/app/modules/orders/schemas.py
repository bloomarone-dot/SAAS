from datetime import datetime
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


class OrderItemUpdateIn(BaseModel):
    menu_item_id: str
    quantity: int = Field(ge=1, le=50)


class OrderStatusUpdateIn(BaseModel):
    status: str = Field(min_length=2, max_length=40)


class CashierPaymentIn(BaseModel):
    payment_method: str = Field(min_length=2, max_length=40)
    discount_amount: Optional[float] = Field(default=None, ge=0)
    cash_register_id: Optional[str] = None


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
    items: list[OrderItemPublic] = Field(default_factory=list)


class CashierReportOut(BaseModel):
    start_date: datetime
    end_date: datetime
    pending_orders_count: int
    paid_orders_count: int
    receipts_count: int
    total_collected: float
    average_ticket: float
    by_payment_method: dict[str, float]
    pending_orders: list[OrderPublic] = Field(default_factory=list)
    receipts: list[OrderPublic] = Field(default_factory=list)
