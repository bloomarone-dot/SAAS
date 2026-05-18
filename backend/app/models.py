"""Compatibilite temporaire pour les imports historiques de `app.models`.

Les nouveaux developpements doivent importer depuis `app.modules.<domaine>`.
"""

from app.modules.branches.models import Branch
from app.modules.restaurants.models import Restaurant
from app.modules.shared.models import Permission, ROLE_DEFAULT_PERMISSIONS, Role, new_id
from app.modules.users.models import User, UserPermission

__all__ = [
    "Branch",
    "Permission",
    "ROLE_DEFAULT_PERMISSIONS",
    "Restaurant",
    "Role",
    "User",
    "UserPermission",
    "new_id",
]
