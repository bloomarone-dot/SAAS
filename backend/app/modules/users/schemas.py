from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.modules.permissions.models import Permission, Role
from app.modules.shared.schemas import OrmModel

PERSON_NAME_PATTERN = r"^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ '-]{1,79}$"
USERNAME_PATTERN = r"^[a-zA-Z0-9._-]{3,50}$"
PHONE_PATTERN = r"^\+?[0-9 ()-]{5,30}$"


class UserPublic(OrmModel):
    """Representation publique d'un utilisateur retournee par l'API."""

    id: str
    email: Optional[str] = None
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
    explicit_permissions: list[Permission] = Field(default_factory=list)
    created_at: datetime


class UserCreateIn(BaseModel):
    """Payload de creation d'un membre du personnel."""

    email: Optional[str] = Field(default=None, max_length=191)
    username: str = Field(min_length=3, max_length=50, pattern=USERNAME_PATTERN)
    password: str = Field(min_length=8, max_length=128)
    first_name: str = Field(min_length=2, max_length=80, pattern=PERSON_NAME_PATTERN)
    last_name: str = Field(min_length=2, max_length=80, pattern=PERSON_NAME_PATTERN)
    phone: Optional[str] = Field(default=None, max_length=30, pattern=PHONE_PATTERN)
    role: Role
    branch_id: Optional[str] = None
    permissions: list[Permission] = Field(default_factory=list)


class UserPermissionsUpdateIn(BaseModel):
    """Payload de remplacement des permissions explicites d'un utilisateur."""

    permissions: list[Permission]


class UserPasswordResetIn(BaseModel):
    """Payload de reinitialisation de mot de passe par un administrateur."""

    password: str = Field(min_length=8, max_length=128)


class UserUpdateIn(BaseModel):
    """Payload de modification des informations et droits d'un utilisateur."""

    email: Optional[str] = Field(default=None, max_length=191)
    username: Optional[str] = Field(default=None, min_length=3, max_length=50, pattern=USERNAME_PATTERN)
    first_name: Optional[str] = Field(default=None, min_length=2, max_length=80, pattern=PERSON_NAME_PATTERN)
    last_name: Optional[str] = Field(default=None, min_length=2, max_length=80, pattern=PERSON_NAME_PATTERN)
    phone: Optional[str] = Field(default=None, max_length=30, pattern=PHONE_PATTERN)
    role: Optional[Role] = None
    branch_id: Optional[str] = None
    permissions: Optional[list[Permission]] = None


class UserStatusUpdateIn(BaseModel):
    """Payload d'activation ou de desactivation d'un compte utilisateur."""

    is_active: bool
