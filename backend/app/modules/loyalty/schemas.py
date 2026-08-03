from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.modules.shared.schemas import OrmModel


class LoyaltyCardPublic(OrmModel):
    id: str
    restaurant_id: str
    phone: str
    customer_name: Optional[str] = None
    stamps: int
    stamps_needed: int = 9
    total_dishes: int
    free_meals_claimed: int
    next_free_in: int
    created_at: datetime
    updated_at: datetime


class LoyaltyPreviewOut(BaseModel):
    phone: str
    customer_name: Optional[str] = None
    stamps_before: int = 0
    dishes_in_order: int = 0
    free_dishes: int = 0
    discount_amount: float = 0
    stamps_after: int = 0
    message: str = ""


class LoyaltyApplyIn(BaseModel):
    order_id: str = Field(min_length=1)
