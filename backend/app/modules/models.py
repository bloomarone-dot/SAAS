"""Registre central des modeles SQLAlchemy.

Ce module force l'import des modeles de chaque domaine avant la creation des
tables ou le lancement des migrations.
"""

from app.modules.branches.models import Branch
from app.modules.catalog.models import MenuCategory, MenuItem
from app.modules.finance.models import RestaurantExpense
from app.modules.orders.models import CustomerOrder, CustomerOrderItem
from app.modules.platform.models import PlatformSetting, RestaurantSubscription
from app.modules.restaurants.models import Restaurant
from app.modules.stock.models import StockDamage, StockItem, StockMovement, StockProductionSheet, StockRecipeIngredient
from app.modules.users.models import User, UserPermission

__all__ = [
    "Branch",
    "MenuCategory",
    "MenuItem",
    "RestaurantExpense",
    "CustomerOrder",
    "CustomerOrderItem",
    "PlatformSetting",
    "Restaurant",
    "RestaurantSubscription",
    "StockDamage",
    "StockItem",
    "StockMovement",
    "StockProductionSheet",
    "StockRecipeIngredient",
    "User",
    "UserPermission",
]
