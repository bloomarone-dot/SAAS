"""P2-4 : frais d'encaissement Mobile Money (Débit 627 / Crédit 512)."""
import unittest
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
import app.modules.models  # noqa: F401
from app.modules.finance import models as fmodels
from app.modules.finance.models import AccountingAccount, AccountingEntry, AccountingEntryLine
from app.modules.finance.router import money, post_payment_fees_entry

RESTO = "resto-A"
USER = "user-1"

FINANCE_TABLES = [
    t.__table__ for t in (
        fmodels.AccountingAccount, fmodels.AccountingJournal, fmodels.AccountingEntry,
        fmodels.AccountingEntryLine, fmodels.CashRegister, fmodels.BankAccount,
        fmodels.ExpenseCategory, fmodels.AccountingPeriodClose,
    )
]


class PaymentFeesTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine, tables=FINANCE_TABLES)
        self.db = sessionmaker(bind=self.engine)()

    def tearDown(self):
        self.db.close()

    def _lines(self, entry):
        return self.db.query(AccountingEntryLine).filter(AccountingEntryLine.accounting_entry_id == entry.id).all()

    def test_fees_debit_627_credit_treasury(self):
        entry = post_payment_fees_entry(self.db, RESTO, source_id="tx-1", reference="CMD-1", amount=Decimal("300"), user_id=USER)
        self.db.commit()
        lines = self._lines(entry)
        self.assertEqual(sum(money(l.debit) for l in lines), sum(money(l.credit) for l in lines))
        debit = next(l for l in lines if l.debit)
        credit = next(l for l in lines if l.credit)
        self.assertEqual(self.db.get(AccountingAccount, debit.account_id).code, "627")
        self.assertEqual(self.db.get(AccountingAccount, credit.account_id).code, "512")
        self.assertEqual(money(debit.debit), Decimal("300.00"))

    def test_idempotent(self):
        a = post_payment_fees_entry(self.db, RESTO, source_id="tx-2", reference="CMD-2", amount=Decimal("150"), user_id=USER)
        self.db.commit()
        b = post_payment_fees_entry(self.db, RESTO, source_id="tx-2", reference="CMD-2", amount=Decimal("150"), user_id=USER)
        self.db.commit()
        self.assertEqual(a.id, b.id)
        self.assertEqual(self.db.query(AccountingEntry).count(), 1)

    def test_zero_amount_nothing(self):
        self.assertIsNone(post_payment_fees_entry(self.db, RESTO, source_id="tx-3", reference="x", amount=Decimal("0"), user_id=USER))


if __name__ == "__main__":
    unittest.main()
