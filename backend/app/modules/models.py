"""Registre central des modeles SQLAlchemy.

Ce module force l'import des modeles de chaque domaine avant la creation des
tables ou le lancement des migrations.
"""

from app.modules.branches.models import Branch
from app.modules.audit.models import AuditLog
from app.modules.catalog.models import MenuCategory, MenuItem
from app.modules.finance.models import PromotionCode, RestaurantExpense
from app.modules.notifications.models import Notification
from app.modules.orders.models import CustomerOrder, CustomerOrderItem
from app.modules.platform.models import PlatformSetting, RestaurantSubscription
from app.modules.payments.models import PaymentTransaction
from app.modules.restaurants.models import Restaurant
from app.modules.stock.models import (
    StockCostCenter,
    StockDamage,
    StockInventory,
    StockInventoryLine,
    StockItem,
    StockItemPackaging,
    StockLot,
    StockMovement,
    StockProductionSheet,
    StockRecipeIngredient,
)
from app.modules.tables.models import TableModel
from app.modules.users.models import User, UserPermission

__all__ = [
    "Branch",
    "AuditLog",
    "MenuCategory",
    "MenuItem",
    "RestaurantExpense",
    "PromotionCode",
    "Notification",
    "CustomerOrder",
    "CustomerOrderItem",
    "PlatformSetting",
    "Restaurant",
    "RestaurantSubscription",
    "PaymentTransaction",
    "StockDamage",
    "StockCostCenter",
    "StockInventory",
    "StockInventoryLine",
    "StockItem",
    "StockItemPackaging",
    "StockLot",
    "StockMovement",
    "StockProductionSheet",
    "StockRecipeIngredient",
    "TableModel",
    "User",
    "UserPermission",
]
