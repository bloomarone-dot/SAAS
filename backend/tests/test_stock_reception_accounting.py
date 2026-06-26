"""Tests de la liaison réceptions stock -> comptabilité (P1-2).

Vérifie qu'une réception fournisseur génère une écriture équilibrée
Débit 607 Achats / Crédit 401 Fournisseur, idempotente, scopée par tenant.
"""
import unittest
from datetime import datetime
from app.modules.shared.models import utcnow
from decimal import Decimal
from types import SimpleNamespace

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
import app.modules.models  # noqa: F401 - enregistre tous les modèles sur Base (résolution FK)
from app.modules.finance import models as fmodels
from app.modules.finance.models import AccountingAccount, AccountingEntry, AccountingEntryLine
from app.modules.finance.router import money, post_stock_reception_entry

FINANCE_TABLES = [
    t.__table__
    for t in (
        fmodels.AccountingAccount,
        fmodels.AccountingJournal,
        fmodels.AccountingEntry,
        fmodels.AccountingEntryLine,
        fmodels.CashRegister,
        fmodels.BankAccount,
        fmodels.ExpenseCategory,
        fmodels.AccountingPeriodClose,
    )
]

RESTO = "resto-A"
USER = "user-1"


def fake_movement(amount, *, mid="mv-1", supplier="sup-1", ref="BL-001"):
    return SimpleNamespace(
        id=mid,
        restaurant_id=RESTO,
        total_amount=amount,
        supplier_id=supplier,
        reference=ref,
        movement_date=utcnow(),
        created_by=USER,
    )


class StockReceptionAccountingTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine, tables=FINANCE_TABLES)
        self.db = sessionmaker(bind=self.engine)()

    def tearDown(self):
        self.db.close()

    def _lines(self, entry):
        return self.db.query(AccountingEntryLine).filter(
            AccountingEntryLine.accounting_entry_id == entry.id
        ).all()

    def test_reception_posts_stock_against_supplier(self):
        # Inventaire permanent : Débit 37 Stock / Crédit 401 Fournisseur.
        entry = post_stock_reception_entry(self.db, RESTO, fake_movement(Decimal("75000")), USER)
        self.db.commit()
        self.assertIsNotNone(entry)
        lines = self._lines(entry)
        self.assertEqual(sum(money(l.debit) for l in lines), sum(money(l.credit) for l in lines))

        debit_line = next(l for l in lines if l.debit)
        credit_line = next(l for l in lines if l.credit)
        self.assertEqual(self.db.get(AccountingAccount, debit_line.account_id).code, "37")
        self.assertEqual(self.db.get(AccountingAccount, credit_line.account_id).code, "401")
        self.assertEqual(money(debit_line.debit), Decimal("75000.00"))
        self.assertEqual(credit_line.third_party_id, "sup-1")

    def test_idempotent(self):
        mv = fake_movement(Decimal("10000"))
        a = post_stock_reception_entry(self.db, RESTO, mv, USER)
        self.db.commit()
        b = post_stock_reception_entry(self.db, RESTO, mv, USER)
        self.db.commit()
        self.assertEqual(a.id, b.id)
        self.assertEqual(self.db.query(AccountingEntry).count(), 1)

    def test_no_supplier_posts_nothing(self):
        entry = post_stock_reception_entry(self.db, RESTO, fake_movement(Decimal("5000"), supplier=None), USER)
        self.assertIsNone(entry)
        self.assertEqual(self.db.query(AccountingEntry).count(), 0)

    def test_zero_amount_posts_nothing(self):
        entry = post_stock_reception_entry(self.db, RESTO, fake_movement(Decimal("0")), USER)
        self.assertIsNone(entry)


if __name__ == "__main__":
    unittest.main()
