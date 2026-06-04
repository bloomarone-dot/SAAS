from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.modules.shared.schemas import OrmModel

NAME_PATTERN = r"^[A-Za-zÀ-ÖØ-öø-ÿ0-9][A-Za-zÀ-ÖØ-öø-ÿ0-9 .,'’()&/-]{1,159}$"


class CategoryBase(BaseModel):
    name: str = Field(min_length=2, max_length=120, pattern=NAME_PATTERN)
    description: Optional[str] = Field(default=None, max_length=255)
    image_url: Optional[str] = Field(default=None, max_length=500)


class CategoryCreate(CategoryBase):
    restaurant_id: Optional[str] = None


class CategoryResponse(CategoryBase, OrmModel):
    id: str
    restaurant_id: str
    is_active: bool
    created_at: datetime


class DishBase(BaseModel):
    name: str = Field(min_length=2, max_length=160, pattern=NAME_PATTERN)
    description: Optional[str] = None
    price: float = Field(gt=0)
    cost_per_dish: float = Field(default=0, ge=0)
    image_url: Optional[str] = Field(default=None, max_length=500)
    is_available: bool = True


class DishCreate(DishBase):
    category_id: Optional[str] = None


class DishUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=160, pattern=NAME_PATTERN)
    description: Optional[str] = None
    price: Optional[float] = Field(default=None, gt=0)
    cost_per_dish: Optional[float] = Field(default=None, ge=0)
    category_id: Optional[str] = None
    image_url: Optional[str] = Field(default=None, max_length=500)
    is_available: Optional[bool] = None


class DishResponse(DishBase, OrmModel):
    id: str
    restaurant_id: str
    category_id: Optional[str] = None
    cost_per_dish: float = 0
    created_at: datetime


class PublicRestaurantMenu(BaseModel):
    restaurant: dict
    categories: list[CategoryResponse]
    dishes: list[DishResponse]
