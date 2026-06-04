"""Compatibilite temporaire pour les imports historiques de `app.schemas`.

Les nouveaux developpements doivent importer depuis `app.modules.<domaine>`.
"""

from app.modules.auth.schemas import ForgotPasswordIn, ForgotPasswordOut, LoginIn, ResetPasswordIn, TokenOut
from app.modules.branches.schemas import BranchCreateIn, BranchPublic
from app.modules.catalog.schemas import (
    MenuCategoryIn,
    MenuCategoryPublic,
    MenuCategoryUpdateIn,
    MenuItemIn,
    MenuItemPublic,
    MenuItemUpdateIn,
)
from app.modules.restaurants.schemas import (
    RestaurantProvisionIn,
    RestaurantProvisionOut,
    RestaurantPublic,
    RestaurantSettingsIn,
)
from app.modules.permissions.schemas import PermissionGroupPublic, PermissionPublic, RolePresetPublic
from app.modules.shared.schemas import OrmModel
from app.modules.stock.schemas import (
    StockDamageIn,
    StockDamagePublic,
    StockItemIn,
    StockItemPublic,
    StockItemUpdateIn,
    StockMovementIn,
    StockMovementPublic,
    StockSummaryOut,
)
from app.modules.users.schemas import (
    UserCreateIn,
    UserPermissionsUpdateIn,
    UserPublic,
    UserStatusUpdateIn,
    UserUpdateIn,
)

__all__ = [
    "BranchCreateIn",
    "BranchPublic",
    "ForgotPasswordIn",
    "ForgotPasswordOut",
    "LoginIn",
    "MenuCategoryIn",
    "MenuCategoryPublic",
    "MenuCategoryUpdateIn",
    "MenuItemIn",
    "MenuItemPublic",
    "MenuItemUpdateIn",
    "OrmModel",
    "PermissionGroupPublic",
    "PermissionPublic",
    "RestaurantProvisionIn",
    "RestaurantProvisionOut",
    "RestaurantPublic",
    "RestaurantSettingsIn",
    "ResetPasswordIn",
    "RolePresetPublic",
    "StockDamageIn",
    "StockDamagePublic",
    "StockItemIn",
    "StockItemPublic",
    "StockItemUpdateIn",
    "StockMovementIn",
    "StockMovementPublic",
    "StockSummaryOut",
    "TokenOut",
    "UserCreateIn",
    "UserPermissionsUpdateIn",
    "UserPublic",
    "UserStatusUpdateIn",
    "UserUpdateIn",
]
