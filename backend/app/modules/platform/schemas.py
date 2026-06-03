from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.modules.shared.schemas import OrmModel


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
