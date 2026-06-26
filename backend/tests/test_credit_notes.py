"""P2-5a : avoirs fournisseurs/clients (écritures de contre-passe)."""
import unittest
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
import app.modules.models  # noqa: F401
from app.modules.finance import models as fmodels
from app.modules.finance.models import AccountingAccount, AccountingEntry, AccountingEntryLine
from app.modules.finance.router import money, post_customer_credit_note, post_supplier_credit_note

RESTO = "resto-A"
USER = "user-1"

FINANCE_TABLES = [
    t.__table__ for t in (
        fmodels.AccountingAccount, fmodels.AccountingJournal, fmodels.AccountingEntry,
        fmodels.AccountingEntryLine, fmodels.CashRegister, fmodels.BankAccount,
        fmodels.ExpenseCategory, fmodels.AccountingPeriodClose,
    )
]


class CreditNoteTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine, tables=FINANCE_TABLES)
        self.db = sessionmaker(bind=self.engine)()

    def tearDown(self):
        self.db.close()

    def _by_code(self, entry):
        out = {}
        for line in self.db.query(AccountingEntryLine).filter(AccountingEntryLine.accounting_entry_id == entry.id).all():
            code = self.db.get(AccountingAccount, line.account_id).code
            out[code] = (money(line.debit), money(line.credit))
        return out

    def test_supplier_credit_note_401_against_stock_and_vat(self):
        entry = post_supplier_credit_note(self.db, RESTO, USER, third_party_id="sup-1",
                                          amount=Decimal("10000"), tax_amount=Decimal("1925"),
                                          reference="AV-F-1", description="Retour marchandise")
        self.db.commit()
        c = self._by_code(entry)
        self.assertEqual(c["401"], (Decimal("11925.00"), Decimal("0.00")))  # débit fournisseur TTC
        self.assertEqual(c["37"], (Decimal("0.00"), Decimal("10000.00")))   # crédit stock HT
        self.assertEqual(c["4456"], (Decimal("0.00"), Decimal("1925.00")))  # crédit TVA déductible

    def test_customer_credit_note_reverses_sale(self):
        entry = post_customer_credit_note(self.db, RESTO, USER, third_party_id="cli-1",
                                          amount=Decimal("10000"), tax_amount=Decimal("1925"),
                                          reference="AV-C-1", description="Geste commercial")
        self.db.commit()
        c = self._by_code(entry)
        self.assertEqual(c["701"], (Decimal("10000.00"), Decimal("0.00")))  # débit ventes HT
        self.assertEqual(c["4457"], (Decimal("1925.00"), Decimal("0.00")))  # débit TVA collectée
        self.assertEqual(c["411"], (Decimal("0.00"), Decimal("11925.00")))  # crédit client TTC

    def test_idempotent_on_reference(self):
        a = post_supplier_credit_note(self.db, RESTO, USER, third_party_id="sup-1", amount=Decimal("5000"),
                                      tax_amount=Decimal("0"), reference="AV-F-9", description="x")
        self.db.commit()
        b = post_supplier_credit_note(self.db, RESTO, USER, third_party_id="sup-1", amount=Decimal("5000"),
                                      tax_amount=Decimal("0"), reference="AV-F-9", description="x")
        self.db.commit()
        self.assertEqual(a.id, b.id)
        self.assertEqual(self.db.query(AccountingEntry).count(), 1)


if __name__ == "__main__":
    unittest.main()
