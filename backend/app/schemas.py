"""Compatibilite temporaire pour les imports historiques de `app.schemas`.

Les nouveaux developpements doivent importer depuis `app.modules.<domaine>`.
"""

from app.modules.auth.schemas import LoginIn, TokenOut
from app.modules.branches.schemas import BranchCreateIn, BranchPublic
from app.modules.restaurants.schemas import (
    RestaurantProvisionIn,
    RestaurantProvisionOut,
    RestaurantPublic,
    RestaurantSettingsIn,
)
from app.modules.shared.schemas import OrmModel
from app.modules.users.schemas import PermissionPublic, UserCreateIn, UserPermissionsUpdateIn, UserPublic

__all__ = [
    "BranchCreateIn",
    "BranchPublic",
    "LoginIn",
    "OrmModel",
    "PermissionPublic",
    "RestaurantProvisionIn",
    "RestaurantProvisionOut",
    "RestaurantPublic",
    "RestaurantSettingsIn",
    "TokenOut",
    "UserCreateIn",
    "UserPermissionsUpdateIn",
    "UserPublic",
]
