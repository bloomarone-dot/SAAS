from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.modules.shared.schemas import OrmModel


class BranchPublic(OrmModel):
    """Representation publique d'une branche."""

    id: str
    restaurant_id: str
    name: str
    city: str
    address: str
    phone: Optional[str] = None
    is_active: bool
    created_at: datetime


class BranchCreateIn(BaseModel):
    """Payload de creation d'une branche du restaurant."""

    name: str = Field(min_length=2, max_length=191)
    city: str = Field(min_length=1, max_length=100)
    address: str = Field(min_length=5, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=30)

