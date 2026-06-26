"""Tests de la liaison écarts d'inventaire -> comptabilité (P1-3).

Excédent => Débit 37 Stock / Crédit 6037 ; Manquant => Débit 6037 / Crédit 37.
Écriture équilibrée, idempotente, écart nul = rien.
"""
import unittest
from datetime import datetime
from app.modules.shared.models import utcnow
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
import app.modules.models  # noqa: F401 - enregistre tous les modèles sur Base (résolution FK)
from app.modules.finance import models as fmodels
from app.modules.finance.models import AccountingAccount, AccountingEntry, AccountingEntryLine
from app.modules.finance.router import money, post_inventory_adjustment_entry

RESTO = "resto-A"
USER = "user-1"

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


class InventoryAdjustmentAccountingTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine, tables=FINANCE_TABLES)
        self.db = sessionmaker(bind=self.engine)()

    def tearDown(self):
        self.db.close()

    def _post(self, net, source_id="inv-1"):
        return post_inventory_adjustment_entry(
            self.db, RESTO,
            source_id=source_id, reference=source_id,
            entry_date=utcnow(), net_amount=net, user_id=USER,
        )

    def _code(self, account_id):
        return self.db.get(AccountingAccount, account_id).code

    def _lines(self, entry):
        return self.db.query(AccountingEntryLine).filter(
            AccountingEntryLine.accounting_entry_id == entry.id
        ).all()

    def test_surplus_debits_stock_credits_variation(self):
        entry = self._post(Decimal("8000"))   # excédent
        self.db.commit()
        lines = self._lines(entry)
        self.assertEqual(sum(money(l.debit) for l in lines), sum(money(l.credit) for l in lines))
        debit = next(l for l in lines if l.debit)
        credit = next(l for l in lines if l.credit)
        self.assertEqual(self._code(debit.account_id), "37")
        self.assertEqual(self._code(credit.account_id), "6037")
        self.assertEqual(money(debit.debit), Decimal("8000.00"))

    def test_shortage_debits_variation_credits_stock(self):
        entry = self._post(Decimal("-4500"), source_id="inv-short")
        self.db.commit()
        lines = self._lines(entry)
        debit = next(l for l in lines if l.debit)
        credit = next(l for l in lines if l.credit)
        self.assertEqual(self._code(debit.account_id), "6037")
        self.assertEqual(self._code(credit.account_id), "37")
        self.assertEqual(money(debit.debit), Decimal("4500.00"))

    def test_zero_variance_posts_nothing(self):
        self.assertIsNone(self._post(Decimal("0")))
        self.assertEqual(self.db.query(AccountingEntry).count(), 0)

    def test_idempotent(self):
        a = self._post(Decimal("1500"))
        self.db.commit()
        b = self._post(Decimal("1500"))
        self.db.commit()
        self.assertEqual(a.id, b.id)
        self.assertEqual(self.db.query(AccountingEntry).count(), 1)


if __name__ == "__main__":
    unittest.main()
