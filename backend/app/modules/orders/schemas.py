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
    items: list[PublicOrderItemIn] = Field(min_length=1)


class OrderItemUpdateIn(BaseModel):
    menu_item_id: str
    quantity: int = Field(ge=1, le=50)


class OrderStatusUpdateIn(BaseModel):
    status: str = Field(min_length=2, max_length=40)


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
    items: Optional[list[OrderItemUpdateIn]] = None


class OrderItemPublic(OrmModel):
    id: str
    menu_item_id: Optional[str] = None
    name: str
    quantity: int
    unit_price: float
    line_total: float


class OrderPublic(OrmModel):
    id: str
    restaurant_id: str
    order_number: str
    customer_name: str
    customer_phone: str
    customer_address: Optional[str] = None
    notes: Optional[str] = None
    status: str
    fulfillment_type: str
    payment_method: str
    discount_amount: float
    delivery_fee: float
    total_amount: float
    cancelled_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    items: list[OrderItemPublic] = Field(default_factory=list)
