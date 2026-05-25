from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.modules.shared.schemas import OrmModel
from app.modules.users.schemas import UserPublic


class RestaurantPublic(OrmModel):
    """Representation publique d'un restaurant/tenant."""

    id: str
    name: str
    slug: str
    logo_url: Optional[str] = None
    description: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    postal_box: Optional[str] = None
    phone: Optional[str] = None
    whatsapp_phone: Optional[str] = None
    email: Optional[str] = None
    opening_hours: Optional[str] = None
    is_open: bool
    payment_methods: Optional[str] = None
    delivery_fee: float
    website_url: Optional[str] = None
    tax_id: Optional[str] = None
    legal_name: Optional[str] = None
    primary_color: str
    secondary_color: str
    currency: str
    timezone: str
    owner_id: Optional[str] = None
    branches_count: int = 1
    is_active: bool
    created_at: datetime


class RestaurantProvisionIn(BaseModel):
    """Donnees necessaires pour creer un restaurant et son proprietaire."""

    name: str = Field(min_length=2, max_length=191)
    slug: str = Field(min_length=2, max_length=191, pattern=r"^[a-z0-9-]+$")
    logo_url: Optional[str] = Field(default=None, max_length=500)
    primary_color: str = Field(default="#E4572E", pattern=r"^#[0-9A-Fa-f]{6}$")
    secondary_color: str = Field(default="#1F2937", pattern=r"^#[0-9A-Fa-f]{6}$")
    currency: str = Field(default="XAF", min_length=3, max_length=3)
    timezone: str = Field(default="Africa/Douala", max_length=50)
    owner_email: str = Field(max_length=191)
    owner_username: str = Field(min_length=3, max_length=50)
    owner_password: str = Field(min_length=8, max_length=128)
    owner_first_name: str = Field(min_length=1, max_length=100)
    owner_last_name: str = Field(min_length=1, max_length=100)
    owner_phone: Optional[str] = Field(default=None, max_length=30)


class RestaurantProvisionOut(BaseModel):
    """Reponse de creation d'un restaurant avec son owner admin."""

    restaurant: RestaurantPublic
    owner: UserPublic


class RestaurantSettingsIn(BaseModel):
    """Champs configurables par le proprietaire du restaurant."""

    name: Optional[str] = Field(default=None, min_length=2, max_length=191)
    logo_url: Optional[str] = Field(default=None, max_length=500)
    description: Optional[str] = None
    address: Optional[str] = Field(default=None, max_length=255)
    city: Optional[str] = Field(default=None, max_length=120)
    country: Optional[str] = Field(default=None, max_length=120)
    postal_box: Optional[str] = Field(default=None, max_length=80)
    phone: Optional[str] = Field(default=None, max_length=30)
    whatsapp_phone: Optional[str] = Field(default=None, max_length=30)
    email: Optional[str] = Field(default=None, max_length=191)
    opening_hours: Optional[str] = Field(default=None, max_length=255)
    is_open: Optional[bool] = None
    payment_methods: Optional[str] = Field(default=None, max_length=255)
    delivery_fee: Optional[float] = Field(default=None, ge=0)
    website_url: Optional[str] = Field(default=None, max_length=500)
    tax_id: Optional[str] = Field(default=None, max_length=100)
    legal_name: Optional[str] = Field(default=None, max_length=191)
    primary_color: Optional[str] = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    secondary_color: Optional[str] = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    currency: Optional[str] = Field(default=None, min_length=3, max_length=3)
    timezone: Optional[str] = Field(default=None, max_length=50)
