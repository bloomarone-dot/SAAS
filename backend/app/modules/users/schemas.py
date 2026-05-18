from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.modules.shared.models import Permission, Role
from app.modules.shared.schemas import OrmModel


class UserPublic(OrmModel):
    """Representation publique d'un utilisateur retournee par l'API."""

    id: str
    email: str
    username: str
    first_name: str
    last_name: str
    phone: Optional[str] = None
    role: Role
    restaurant_id: Optional[str] = None
    branch_id: Optional[str] = None
    is_owner: bool
    is_active: bool
    permissions: list[Permission] = Field(default_factory=list)
    created_at: datetime


class UserCreateIn(BaseModel):
    """Payload de creation d'un membre du personnel."""

    email: str = Field(max_length=191)
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8, max_length=128)
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    phone: Optional[str] = Field(default=None, max_length=30)
    role: Role
    branch_id: Optional[str] = None
    permissions: list[Permission] = Field(default_factory=list)


class UserPermissionsUpdateIn(BaseModel):
    """Payload de remplacement des permissions explicites d'un utilisateur."""

    permissions: list[Permission]


class PermissionPublic(BaseModel):
    """Permission affichable dans l'interface d'administration."""

    key: Permission
    label: str

