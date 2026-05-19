"""Registre central des modeles SQLAlchemy.

Ce module force l'import des modeles de chaque domaine avant la creation des
tables ou le lancement des migrations.
"""

from app.modules.branches.models import Branch
from app.modules.catalog.models import MenuCategory, MenuItem
from app.modules.restaurants.models import Restaurant
from app.modules.stock.models import StockDamage, StockItem, StockMovement
from app.modules.users.models import User, UserPermission

__all__ = [
    "Branch",
    "MenuCategory",
    "MenuItem",
    "Restaurant",
    "StockDamage",
    "StockItem",
    "StockMovement",
    "User",
    "UserPermission",
]
