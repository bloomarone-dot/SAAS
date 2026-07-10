from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.modules.shared.schemas import OrmModel

NAME_PATTERN = r"^[A-Za-zÀ-ÖØ-öø-ÿ0-9][A-Za-zÀ-ÖØ-öø-ÿ0-9 \.,'’\(\)\&\/\-]{1,190}$"
PHONE_PATTERN = r"^\+?[0-9 \(\)\-]{5,30}$"


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

    name: str = Field(min_length=2, max_length=191, pattern=NAME_PATTERN)
    city: str = Field(min_length=2, max_length=100, pattern=NAME_PATTERN)
    address: str = Field(min_length=5, max_length=255)
    phone: Optional[str] = Field(default=None, max_length=30, pattern=PHONE_PATTERN)
    manager_id: Optional[str] = None
