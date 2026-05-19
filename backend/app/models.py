"""Compatibilite temporaire pour les imports historiques de `app.models`.

Les nouveaux developpements doivent importer depuis `app.modules.<domaine>`.
"""

from app.modules.branches.models import Branch
from app.modules.catalog.models import MenuCategory, MenuItem
from app.modules.permissions.models import Permission, ROLE_DEFAULT_PERMISSIONS, Role
from app.modules.restaurants.models import Restaurant
from app.modules.shared.models import new_id
from app.modules.stock.models import (
    StockDamage,
    StockItem,
    StockLocation,
    StockMovement,
    StockMovementType,
    StockProductType,
)
from app.modules.users.models import User, UserPermission

__all__ = [
    "Branch",
    "MenuCategory",
    "MenuItem",
    "Permission",
    "ROLE_DEFAULT_PERMISSIONS",
    "Restaurant",
    "Role",
    "StockDamage",
    "StockItem",
    "StockLocation",
    "StockMovement",
    "StockMovementType",
    "StockProductType",
    "User",
    "UserPermission",
    "new_id",
]
