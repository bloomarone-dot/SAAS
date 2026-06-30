from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field, validator

from app.modules.shared.schemas import OrmModel
from app.security import validate_password_strength


class SubscriptionPublic(OrmModel):
    id: str
    restaurant_id: str
    restaurant_name: str
    restaurant_slug: str
    restaurant_active: bool
    plan: str
    amount: int
    currency: str
    status: str
    renewal_date: Optional[date] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class PlatformPaymentPublic(BaseModel):
    id: str
    restaurant_id: str
    restaurant_name: str
    restaurant_slug: str
    reference: str
    amount: int
    currency: str
    status: str
    method: str
    paid_at: Optional[datetime] = None
    due_date: Optional[date] = None


class PlatformActivityPublic(BaseModel):
    id: str
    restaurant_id: Optional[str] = None
    restaurant_name: Optional[str] = None
    user_id: Optional[str] = None
    user_role: Optional[str] = None
    action: str
    entity_type: str
    entity_id: Optional[str] = None
    description: str
    details_json: Optional[str] = None
    created_at: datetime


class SubscriptionUpdateIn(BaseModel):
    plan: str = Field(min_length=2, max_length=80)
    amount: int = Field(ge=0)
    currency: str = Field(default="XAF", min_length=3, max_length=3)
    status: str = Field(min_length=2, max_length=40)
    renewal_date: Optional[date] = None
    notes: Optional[str] = None


class PlatformUserPasswordResetIn(BaseModel):
    password: str = Field(min_length=8, max_length=128)

    @validator("password")
    def password_is_strong(cls, value: str) -> str:
        return validate_password_strength(value)


class PlatformSettingsPublic(BaseModel):
    platform_name: str
    support_email: str
    default_currency: str
    default_timezone: str
    trial_days: int
    expiration_notice_days: int
    allow_public_signup: bool
    require_owner_approval: bool


class PlatformSettingsUpdateIn(BaseModel):
    platform_name: str = Field(min_length=2, max_length=120)
    support_email: str = Field(min_length=3, max_length=191)
    default_currency: str = Field(min_length=3, max_length=3)
    default_timezone: str = Field(min_length=3, max_length=80)
    trial_days: int = Field(ge=0, le=365)
    expiration_notice_days: int = Field(ge=0, le=90)
    allow_public_signup: bool
    require_owner_approval: bool


class InstanceRequestCreateIn(BaseModel):
    """Demande publique de création d'instance depuis la landing SaaS."""
    restaurant_name: str = Field(min_length=2, max_length=191)
    owner_name: str = Field(min_length=2, max_length=160)
    owner_email: Optional[str] = Field(default=None, max_length=191)
    owner_phone: str = Field(min_length=5, max_length=40)
    city: Optional[str] = Field(default=None, max_length=120)
    address: Optional[str] = Field(default=None, max_length=255)
    business_type: Optional[str] = Field(default=None, max_length=120)
    employees_count: Optional[int] = Field(default=None, ge=0, le=100000)
    message: Optional[str] = Field(default=None, max_length=2000)


class InstanceRequestPublic(OrmModel):
    id: str
    restaurant_name: str
    owner_name: str
    owner_email: Optional[str] = None
    owner_phone: str
    city: Optional[str] = None
    address: Optional[str] = None
    business_type: Optional[str] = None
    employees_count: Optional[int] = None
    message: Optional[str] = None
    status: str
    created_restaurant_id: Optional[str] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class InstanceRequestApproveOut(BaseModel):
    request_id: str
    restaurant_id: str
    restaurant_slug: str
    landing_url: str
    login_url: str
    admin_username: str
    admin_temporary_password: str
    message: str


class PlatformOverview(BaseModel):
    tenants_count: int
    active_tenants_count: int
    inactive_tenants_count: int
    configured_subscriptions_count: int
    pending_subscriptions_count: int
    monthly_recurring_revenue: int
    currency: str
    last_checked_at: datetime
    checks: list[dict[str, str]]
