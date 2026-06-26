"""Tests de la liaison ventes -> comptabilité (P1-1).

Vérifie que l'encaissement d'une commande génère une écriture SYSCOHADA
équilibrée (débit trésorerie / crédit 701 + 4457 TVA 19,25 %), idempotente.
Base SQLite en mémoire, sans dépendance MySQL ni startup app.
"""
import unittest
from decimal import Decimal
from types import SimpleNamespace

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
import app.modules.models  # noqa: F401 - enregistre tous les modèles sur Base (résolution FK)
from app.modules.finance import models as fmodels
from app.modules.finance.models import (
    AccountingEntry,
    AccountingEntryLine,
    EntryStatus,
    PaymentMethod,
)
from app.modules.finance.router import money, post_order_sale_entry, post_order_sale_entry_safe

# On ne crée que les tables comptables nécessaires : éviter les FK legacy
# (customer_order_items -> stock_items) absentes d'un metadata SQLite neuf.
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


def fake_order(total, *, order_id="cmd-1", method="Espèces", number="CMD-001"):
    return SimpleNamespace(
        id=order_id,
        restaurant_id=RESTO,
        total_amount=total,
        payment_method=method,
        order_number=number,
        cashier_id=USER,
    )


class SalesAccountingTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine, tables=FINANCE_TABLES)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

    def tearDown(self):
        self.db.close()

    def _lines(self, entry):
        return (
            self.db.query(AccountingEntryLine)
            .filter(AccountingEntryLine.accounting_entry_id == entry.id)
            .all()
        )

    def test_cash_sale_posts_balanced_entry(self):
        # 11 925 TTC => 10 000 HT + 1 925 TVA (19,25 %)
        entry = post_order_sale_entry(self.db, RESTO, fake_order(Decimal("11925")), USER)
        self.db.commit()

        self.assertIsNotNone(entry)
        self.assertEqual(entry.status, EntryStatus.POSTED)
        self.assertEqual(entry.source_type, "order_sale")

        lines = self._lines(entry)
        total_debit = sum(money(l.debit) for l in lines)
        total_credit = sum(money(l.credit) for l in lines)
        self.assertEqual(total_debit, total_credit)  # équilibre comptable
        self.assertEqual(total_debit, Decimal("11925.00"))

        by_credit = {money(l.credit): l for l in lines if l.credit}
        self.assertIn(Decimal("10000.00"), by_credit)  # 701 Ventes HT
        self.assertIn(Decimal("1925.00"), by_credit)   # 4457 TVA collectée

    def test_idempotent_no_double_posting(self):
        order = fake_order(Decimal("5000"))
        first = post_order_sale_entry(self.db, RESTO, order, USER)
        self.db.commit()
        second = post_order_sale_entry(self.db, RESTO, order, USER)
        self.db.commit()

        self.assertEqual(first.id, second.id)
        count = self.db.query(AccountingEntry).filter(
            AccountingEntry.source_type == "order_sale",
            AccountingEntry.source_id == order.id,
        ).count()
        self.assertEqual(count, 1)

    def test_zero_total_posts_nothing(self):
        entry = post_order_sale_entry(self.db, RESTO, fake_order(Decimal("0")), USER)
        self.assertIsNone(entry)
        self.assertEqual(self.db.query(AccountingEntry).count(), 0)

    def test_mobile_money_uses_bank_treasury(self):
        order = fake_order(Decimal("11925"), order_id="cmd-mm", method="Orange Money", number="CMD-MM")
        entry = post_order_sale_entry(self.db, RESTO, order, USER, payment_method=PaymentMethod.MOBILE_MONEY)
        self.db.commit()
        debit_line = next(l for l in self._lines(entry) if l.debit)
        # Le compte de débit doit être la banque/trésorerie (512), pas la caisse (530).
        from app.modules.finance.models import AccountingAccount
        account = self.db.get(AccountingAccount, debit_line.account_id)
        self.assertEqual(account.code, "512")

    def test_safe_wrapper_is_idempotent_and_non_blocking(self):
        order = fake_order(Decimal("2000"))
        post_order_sale_entry_safe(self.db, order, USER)
        post_order_sale_entry_safe(self.db, order, USER)
        self.db.commit()
        count = self.db.query(AccountingEntry).filter(
            AccountingEntry.source_id == order.id
        ).count()
        self.assertEqual(count, 1)


if __name__ == "__main__":
    unittest.main()
