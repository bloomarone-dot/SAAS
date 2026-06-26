"""Rapprochement bancaire : pointage des lignes + écart solde comptable / relevé."""
import unittest
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
import app.modules.models  # noqa: F401
from app.modules.finance import models as fmodels
from app.modules.finance.models import AccountingEntryLine, EntryStatus, JournalType
from app.modules.finance.router import (
    EntryIn,
    EntryLineIn,
    bank_reconciliation,
    create_accounting_entry,
    ensure_default_accounting,
    journal_by_type,
)

RESTO = "resto-A"
USER = "user-1"

FINANCE_TABLES = [
    t.__table__ for t in (
        fmodels.AccountingAccount, fmodels.AccountingJournal, fmodels.AccountingEntry,
        fmodels.AccountingEntryLine, fmodels.CashRegister, fmodels.BankAccount,
        fmodels.ExpenseCategory, fmodels.AccountingPeriodClose,
    )
]


class BankReconciliationTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine, tables=FINANCE_TABLES)
        self.db = sessionmaker(bind=self.engine)()
        self.defaults = ensure_default_accounting(self.db, RESTO)
        self.bank_id = self.defaults["bank"].id  # 512
        journal = journal_by_type(self.db, RESTO, JournalType.BANK)
        # Encaissement : Débit 512 1000 / Crédit 701 1000
        create_accounting_entry(self.db, RESTO, USER, EntryIn(
            journal_id=journal.id, description="Encaissement",
            lines=[EntryLineIn(account_id=self.bank_id, label="enc", debit=1000, credit=0),
                   EntryLineIn(account_id=self.defaults["sales"].id, label="enc", debit=0, credit=1000)],
        ), status=EntryStatus.POSTED)
        # Frais : Débit 627 400 / Crédit 512 400
        create_accounting_entry(self.db, RESTO, USER, EntryIn(
            journal_id=journal.id, description="Frais",
            lines=[EntryLineIn(account_id=self.defaults["operator_fees"].id, label="f", debit=400, credit=0),
                   EntryLineIn(account_id=self.bank_id, label="f", debit=0, credit=400)],
        ), status=EntryStatus.POSTED)
        # Pointer la ligne d'encaissement (débit 512 = 1000)
        debit_line = self.db.query(AccountingEntryLine).filter(
            AccountingEntryLine.account_id == self.bank_id, AccountingEntryLine.debit > 0
        ).one()
        debit_line.reconciled = True
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_balances_and_unreconciled(self):
        r = bank_reconciliation(self.db, RESTO, self.bank_id, statement_balance=Decimal("1000"))
        self.assertEqual(r["book_balance"], Decimal("600.00"))        # 1000 - 400
        self.assertEqual(r["reconciled_balance"], Decimal("1000.00"))  # ligne pointée
        self.assertEqual(r["unreconciled_total"], Decimal("-400.00"))  # frais non pointés
        self.assertEqual(len(r["unreconciled_lines"]), 1)
        self.assertEqual(r["gap"], Decimal("0.00"))                    # relevé = lignes pointées

    def test_gap_when_statement_differs(self):
        r = bank_reconciliation(self.db, RESTO, self.bank_id, statement_balance=Decimal("1200"))
        self.assertEqual(r["gap"], Decimal("200.00"))  # 1200 - 1000 pointé

    def test_no_statement_gap_is_none(self):
        r = bank_reconciliation(self.db, RESTO, self.bank_id)
        self.assertIsNone(r["statement_balance"])
        self.assertIsNone(r["gap"])


if __name__ == "__main__":
    unittest.main()
