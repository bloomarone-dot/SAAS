from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, validator

from app.modules.shared.schemas import OrmModel
from app.modules.users.schemas import UserPublic
from app.security import validate_password_strength

NAME_PATTERN = r"^[A-Za-zÀ-ÖØ-öø-ÿ0-9][A-Za-zÀ-ÖØ-öø-ÿ0-9 \.,'’\(\)\&\/\-]{1,190}$"
PERSON_NAME_PATTERN = r"^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ '\-]{1,79}$"
USERNAME_PATTERN = r"^[a-zA-Z0-9\._\-]{3,50}$"
PHONE_PATTERN = r"^\+?[0-9 \(\)\-]{5,30}$"
CURRENCY_PATTERN = r"^[A-Za-z]{3}$"
TIMEZONE_PATTERN = r"^[A-Za-z_]+/[A-Za-z0-9_\+\-\/]+$"


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
    nui: Optional[str] = None
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

    name: str = Field(min_length=2, max_length=191, pattern=NAME_PATTERN)
    slug: Optional[str] = Field(default=None, min_length=2, max_length=191, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    logo_url: Optional[str] = Field(default=None, max_length=500)
    primary_color: str = Field(default="#E4572E", pattern=r"^#[0-9A-Fa-f]{6}$")
    secondary_color: str = Field(default="#1F2937", pattern=r"^#[0-9A-Fa-f]{6}$")
    currency: str = Field(default="XAF", min_length=3, max_length=3, pattern=CURRENCY_PATTERN)
    timezone: str = Field(default="Africa/Douala", max_length=50, pattern=TIMEZONE_PATTERN)
    owner_email: Optional[str] = Field(default=None, max_length=191)
    owner_username: str = Field(min_length=3, max_length=50, pattern=USERNAME_PATTERN)
    owner_password: str = Field(min_length=10, max_length=128)
    owner_first_name: str = Field(min_length=2, max_length=80, pattern=PERSON_NAME_PATTERN)
    owner_last_name: str = Field(min_length=2, max_length=80, pattern=PERSON_NAME_PATTERN)
    owner_phone: str = Field(min_length=5, max_length=30, pattern=PHONE_PATTERN)
    owner_alt_phone: Optional[str] = Field(default=None, max_length=30, pattern=PHONE_PATTERN)

    @validator("owner_password")
    def owner_password_is_strong(cls, value: str) -> str:
        return validate_password_strength(value)


class RestaurantProvisionOut(BaseModel):
    """Reponse de creation d'un restaurant avec son owner admin."""

    restaurant: RestaurantPublic
    owner: UserPublic


class RestaurantDetailPublic(BaseModel):
    """Fiche superadmin d'un restaurant avec son proprietaire."""

    restaurant: RestaurantPublic
    owner: Optional[UserPublic] = None
    subscription: Optional[dict] = None


class RestaurantStatusIn(BaseModel):
    """Payload d'activation ou suspension d'un tenant restaurant."""

    is_active: bool


class RestaurantSettingsIn(BaseModel):
    """Champs configurables par le proprietaire du restaurant."""

    name: Optional[str] = Field(default=None, min_length=2, max_length=191, pattern=NAME_PATTERN)
    logo_url: Optional[str] = Field(default=None, max_length=500)
    description: Optional[str] = None
    address: Optional[str] = Field(default=None, max_length=255)
    city: Optional[str] = Field(default=None, max_length=120, pattern=NAME_PATTERN)
    country: Optional[str] = Field(default=None, max_length=120, pattern=NAME_PATTERN)
    postal_box: Optional[str] = Field(default=None, max_length=80)
    phone: Optional[str] = Field(default=None, max_length=30, pattern=PHONE_PATTERN)
    whatsapp_phone: Optional[str] = Field(default=None, max_length=30, pattern=PHONE_PATTERN)
    email: Optional[str] = Field(default=None, max_length=191)
    opening_hours: Optional[str] = Field(default=None, max_length=255)
    is_open: Optional[bool] = None
    payment_methods: Optional[str] = Field(default=None, max_length=255)
    delivery_fee: Optional[float] = Field(default=None, ge=0)
    website_url: Optional[str] = Field(default=None, max_length=500)
    nui: Optional[str] = Field(default=None, max_length=100)
    tax_id: Optional[str] = Field(default=None, max_length=100)
    legal_name: Optional[str] = Field(default=None, max_length=191, pattern=NAME_PATTERN)
    primary_color: Optional[str] = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    secondary_color: Optional[str] = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    currency: Optional[str] = Field(default=None, min_length=3, max_length=3, pattern=CURRENCY_PATTERN)
    timezone: Optional[str] = Field(default=None, max_length=50, pattern=TIMEZONE_PATTERN)
