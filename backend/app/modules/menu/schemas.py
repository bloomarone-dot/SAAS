from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.modules.shared.schemas import OrmModel


class CategoryBase(BaseModel):
    name: str = Field(min_length=2, max_length=120)
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
    name: str = Field(min_length=2, max_length=160)
    description: Optional[str] = None
    price: float = Field(gt=0)
    image_url: Optional[str] = Field(default=None, max_length=500)
    is_available: bool = True


class DishCreate(DishBase):
    category_id: Optional[str] = None


class DishUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=160)
    description: Optional[str] = None
    price: Optional[float] = Field(default=None, gt=0)
    category_id: Optional[str] = None
    image_url: Optional[str] = Field(default=None, max_length=500)
    is_available: Optional[bool] = None


class DishResponse(DishBase, OrmModel):
    id: str
    restaurant_id: str
    category_id: Optional[str] = None
    created_at: datetime


class PublicRestaurantMenu(BaseModel):
    restaurant: dict
    categories: list[CategoryResponse]
    dishes: list[DishResponse]
