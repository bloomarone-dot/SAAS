from pydantic import BaseModel

from app.modules.permissions.models import Permission, Role


class PermissionPublic(BaseModel):
    """Permission affichable dans l'interface d'administration."""

    key: Permission
    label: str


class PermissionGroupPublic(BaseModel):
    """Groupe de permissions affiche dans l'administration."""

    key: str
    label: str
    description: str
    permissions: list[PermissionPublic]


class RolePresetPublic(BaseModel):
    """Droits par defaut associes a un role operationnel."""

    role: Role
    label: str
    description: str
    permissions: list[Permission]

