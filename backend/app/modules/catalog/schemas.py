from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, validator

from app.modules.menu.schemas import _round_money
from app.modules.shared.schemas import OrmModel


class MenuCategoryPublic(OrmModel):
    id: str
    restaurant_id: str
    name: str
    description: Optional[str] = None
    is_active: bool
    created_at: datetime


class MenuCategoryIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: Optional[str] = Field(default=None, max_length=255)


class MenuCategoryUpdateIn(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    description: Optional[str] = Field(default=None, max_length=255)
    is_active: Optional[bool] = None


class MenuItemPublic(OrmModel):
    id: str
    restaurant_id: str
    category_id: Optional[str] = None
    name: str
    description: Optional[str] = None
    price: float
    cost_per_dish: float = 0
    sale_channel: str = "REPAS"
    requires_kitchen: Optional[bool] = None
    image_url: Optional[str] = None
    is_available: bool
    created_at: datetime

    @validator("price", "cost_per_dish", pre=True, always=True)
    def response_money_rounded(cls, value):
        return _round_money(value) if value is not None else 0


class MenuItemIn(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    description: Optional[str] = None
    price: float = Field(gt=0)
    cost_per_dish: float = Field(default=0, ge=0)
    category_id: Optional[str] = None
    requires_kitchen: Optional[bool] = None
    image_url: Optional[str] = Field(default=None, max_length=500)

    @validator("price", "cost_per_dish", pre=True)
    def money_as_whole_fcfa(cls, value):
        if value is None or value == "":
            return value
        return _round_money(value)


class MenuItemUpdateIn(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=160)
    description: Optional[str] = None
    price: Optional[float] = Field(default=None, gt=0)
    cost_per_dish: Optional[float] = Field(default=None, ge=0)
    category_id: Optional[str] = None
    requires_kitchen: Optional[bool] = None
    image_url: Optional[str] = Field(default=None, max_length=500)
    is_available: Optional[bool] = None

    @validator("price", "cost_per_dish", pre=True)
    def money_as_whole_fcfa(cls, value):
        if value is None or value == "":
            return value
        return _round_money(value)
