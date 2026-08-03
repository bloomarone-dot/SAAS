from datetime import datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Optional
import re

from pydantic import BaseModel, Field, validator

from app.modules.shared.schemas import OrmModel

NAME_PATTERN = r"^[A-Za-zÀ-ÖØ-öø-ÿ0-9][A-Za-zÀ-ÖØ-öø-ÿ0-9 \.,'’\(\)\&\/\-]{1,159}$"
_EU_THOUSANDS = re.compile(r"^\d{1,3}(\.\d{3})+$")


def _round_money(value: float | int | str | Decimal | None) -> float | None:
    """Normalise un montant FCFA en entier (évite 15000→14999 et '1.500'→1.5)."""
    if value is None or value == "":
        return None
    try:
        if isinstance(value, str):
            compact = (
                value.strip()
                .replace("\u00a0", "")
                .replace("\u202f", "")
                .replace(" ", "")
                .replace("FCFA", "")
                .replace("fcfa", "")
                .replace("XAF", "")
            )
            if _EU_THOUSANDS.match(compact):
                amount = Decimal(compact.replace(".", ""))
            else:
                amount = Decimal(compact.replace(",", "."))
        elif isinstance(value, Decimal):
            amount = value
        else:
            amount = Decimal(str(value))
        return float(int(amount.quantize(Decimal("1"), rounding=ROUND_HALF_UP)))
    except (InvalidOperation, ValueError, TypeError):
        return float(round(float(value)))


class CategoryBase(BaseModel):
    name: str = Field(min_length=2, max_length=120, pattern=NAME_PATTERN)
    description: Optional[str] = Field(default=None, max_length=255)
    image_url: Optional[str] = Field(default=None, max_length=500)


class CategoryCreate(CategoryBase):
    restaurant_id: Optional[str] = None


class CategoryUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=120, pattern=NAME_PATTERN)
    description: Optional[str] = Field(default=None, max_length=255)
    image_url: Optional[str] = Field(default=None, max_length=500)
    is_active: Optional[bool] = None


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
    requires_kitchen: Optional[bool] = None

    @validator("price", "cost_per_dish", pre=True)
    def money_as_whole_fcfa(cls, value):
        if value is None or value == "":
            return value
        return _round_money(value)


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
    requires_kitchen: Optional[bool] = None

    @validator("price", "cost_per_dish", pre=True)
    def money_as_whole_fcfa(cls, value):
        if value is None or value == "":
            return value
        return _round_money(value)


class DishResponse(DishBase, OrmModel):
    id: str
    restaurant_id: str
    category_id: Optional[str] = None
    cost_per_dish: float = 0
    requires_kitchen: Optional[bool] = None
    created_at: datetime

    @validator("price", "cost_per_dish", pre=True, always=True)
    def response_money_rounded(cls, value):
        return _round_money(value) if value is not None else 0


class PublicRestaurantMenu(BaseModel):
    restaurant: dict
    categories: list[CategoryResponse]
    dishes: list[DishResponse]
