"""Helpers de schéma pour les tests (création ciblée de tables SQLite).

Évite `Base.metadata.create_all` global pour garder les tests ciblés et rapides.
"""
from app.modules.finance import models as _fm
from app.modules.stock import models as _sm
from app.modules.users.models import User

FINANCE_TABLES = [
    _fm.AccountingAccount.__table__,
    _fm.AccountingJournal.__table__,
    _fm.AccountingEntry.__table__,
    _fm.AccountingEntryLine.__table__,
    _fm.CashRegister.__table__,
    _fm.BankAccount.__table__,
    _fm.ExpenseCategory.__table__,
    _fm.AccountingPeriodClose.__table__,
]

STOCK_TABLES = [
    _sm.Product.__table__,
    _sm.StockMovement.__table__,
    _sm.Depot.__table__,
    _sm.Unit.__table__,
    _sm.StockRecipeIngredient.__table__,
    _sm.StockItemPackaging.__table__,
    _sm.Inventory.__table__,
    _sm.InventoryDetail.__table__,
    User.__table__,
]

# Stock + comptabilité : reflète la coexistence en production (le déstockage poste le COGS).
STOCK_WITH_ACCOUNTING = STOCK_TABLES + FINANCE_TABLES
