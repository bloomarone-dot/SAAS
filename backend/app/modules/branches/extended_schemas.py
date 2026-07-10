from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.modules.branches.schemas import NAME_PATTERN, PHONE_PATTERN
from app.modules.shared.schemas import OrmModel


class BranchUpdateIn(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=191, pattern=NAME_PATTERN)
    city: Optional[str] = Field(default=None, min_length=2, max_length=100, pattern=NAME_PATTERN)
    address: Optional[str] = Field(default=None, min_length=5, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=30, pattern=PHONE_PATTERN)
    manager_id: Optional[str] = None
    is_active: Optional[bool] = None


class BranchDetailPublic(OrmModel):
    id: str
    restaurant_id: str
    name: str
    city: str
    address: str
    phone: Optional[str] = None
    is_active: bool
    created_at: datetime
    manager_id: Optional[str] = None
    manager_name: Optional[str] = None
    users_count: int = 0
    cash_registers_count: int = 0


class DeliveryAreaPublic(OrmModel):
    id: str
    restaurant_id: str
    branch_id: Optional[str] = None
    branch_name: Optional[str] = None
    name: str
    delivery_fee: float
    average_delivery_minutes: Optional[int] = None
    is_active: bool
    created_at: datetime


class DeliveryAreaCreateIn(BaseModel):
    name: str = Field(min_length=2, max_length=191, pattern=NAME_PATTERN)
    delivery_fee: float = Field(ge=0)
    branch_id: Optional[str] = None
    average_delivery_minutes: Optional[int] = Field(default=None, ge=1, le=600)
    is_active: bool = True


class DeliveryAreaUpdateIn(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=191, pattern=NAME_PATTERN)
    delivery_fee: Optional[float] = Field(default=None, ge=0)
    branch_id: Optional[str] = None
    average_delivery_minutes: Optional[int] = Field(default=None, ge=1, le=600)
    is_active: Optional[bool] = None
