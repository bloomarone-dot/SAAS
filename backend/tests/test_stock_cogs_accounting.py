"""P0-2b : COGS au déstockage (Débit 6037 / Crédit 37 au CMUP, inventaire permanent)."""
import unittest
from datetime import datetime
from app.modules.shared.models import utcnow
from decimal import Decimal
from types import SimpleNamespace

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
import app.modules.models  # noqa: F401
from app.modules.permissions.models import Role
from app.modules.finance import models as fmodels
from app.modules.finance.models import AccountingAccount, AccountingEntry, AccountingEntryLine
from app.modules.finance.router import money, post_stock_cogs_entry
from app.modules.stock.models import Depot, DepotType, Product, StockLot, StockMovement, StockMovementType
from app.modules.stock.router import add_movement
from app.modules.users.models import User

RESTO = "resto-A"
USER = "user-1"

FINANCE_TABLES = [
    t.__table__ for t in (
        fmodels.AccountingAccount, fmodels.AccountingJournal, fmodels.AccountingEntry,
        fmodels.AccountingEntryLine, fmodels.CashRegister, fmodels.BankAccount,
        fmodels.ExpenseCategory, fmodels.AccountingPeriodClose,
    )
]
STOCK_TABLES = [Product.__table__, StockMovement.__table__, Depot.__table__, StockLot.__table__, User.__table__]


def fake_movement(amount, mid="mv-1"):
    return SimpleNamespace(id=mid, restaurant_id=RESTO, total_amount=amount,
                           reference="BS-1", movement_date=utcnow(), created_by=USER)


class CogsHelperTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine, tables=FINANCE_TABLES)
        self.db = sessionmaker(bind=self.engine)()

    def tearDown(self):
        self.db.close()

    def test_cogs_debits_6037_credits_37(self):
        entry = post_stock_cogs_entry(self.db, RESTO, fake_movement(Decimal("750")), USER)
        self.db.commit()
        lines = self.db.query(AccountingEntryLine).filter(AccountingEntryLine.accounting_entry_id == entry.id).all()
        self.assertEqual(sum(money(l.debit) for l in lines), sum(money(l.credit) for l in lines))
        debit = next(l for l in lines if l.debit)
        credit = next(l for l in lines if l.credit)
        self.assertEqual(self.db.get(AccountingAccount, debit.account_id).code, "6037")
        self.assertEqual(self.db.get(AccountingAccount, credit.account_id).code, "37")
        self.assertEqual(money(debit.debit), Decimal("750.00"))

    def test_idempotent(self):
        mv = fake_movement(Decimal("500"))
        a = post_stock_cogs_entry(self.db, RESTO, mv, USER)
        self.db.commit()
        b = post_stock_cogs_entry(self.db, RESTO, mv, USER)
        self.db.commit()
        self.assertEqual(a.id, b.id)
        self.assertEqual(self.db.query(AccountingEntry).count(), 1)

    def test_zero_amount_nothing(self):
        self.assertIsNone(post_stock_cogs_entry(self.db, RESTO, fake_movement(Decimal("0")), USER))


class CogsIntegrationTests(unittest.TestCase):
    """Vérifie le branchement add_movement -> COGS (sortie) et l'absence pour entrée/transfert."""

    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine, tables=FINANCE_TABLES + STOCK_TABLES)
        self.db = sessionmaker(bind=self.engine)()
        self.main = Depot(restaurant_id=RESTO, name="Magasin", code="MAIN", type=DepotType.PRINCIPAL, is_active=True)
        self.kitchen = Depot(restaurant_id=RESTO, name="Cuisine", code="KITCHEN", type=DepotType.CUISINE, is_active=True)
        self.product = Product(restaurant_id=RESTO, name="Riz", unit_id="u1",
                               purchase_price=Decimal("150.00"), cmup=Decimal("150.00"))
        self.db.add_all([
            self.main, self.kitchen, self.product,
            User(id=USER, username="u", first_name="A", last_name="B", password_hash="x",
                 role=Role.ADMIN, restaurant_id=RESTO, is_owner=True, is_active=True, created_at=utcnow()),
        ])
        self.db.commit()
        add_movement(self.db, restaurant_id=RESTO, user_id=USER, movement_type=StockMovementType.ENTRY,
                     product_id=self.product.id, destination_depot_id=self.main.id,
                     quantity=Decimal("10"), unit_price=Decimal("150.00"))
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def _cogs_entries(self):
        return self.db.query(AccountingEntry).filter(AccountingEntry.source_type == "stock_cogs").all()

    def test_entry_does_not_post_cogs(self):
        self.assertEqual(len(self._cogs_entries()), 0)

    def test_output_posts_cogs_at_cmup(self):
        add_movement(self.db, restaurant_id=RESTO, user_id=USER, movement_type=StockMovementType.OUTPUT,
                     product_id=self.product.id, source_depot_id=self.main.id, quantity=Decimal("5"))
        self.db.commit()
        entries = self._cogs_entries()
        self.assertEqual(len(entries), 1)
        lines = self.db.query(AccountingEntryLine).filter(AccountingEntryLine.accounting_entry_id == entries[0].id).all()
        self.assertEqual(sum(money(l.debit) for l in lines), Decimal("750.00"))  # 5 x CMUP 150

    def test_transfer_does_not_post_cogs(self):
        add_movement(self.db, restaurant_id=RESTO, user_id=USER, movement_type=StockMovementType.TRANSFER,
                     product_id=self.product.id, source_depot_id=self.main.id,
                     destination_depot_id=self.kitchen.id, quantity=Decimal("3"))
        self.db.commit()
        self.assertEqual(len(self._cogs_entries()), 0)


if __name__ == "__main__":
    unittest.main()
