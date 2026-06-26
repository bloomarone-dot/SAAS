"""Tests TVA 19,25 % (P1-4) : auto-calcul HT->TVA et déclaration mensuelle."""
import unittest
from datetime import datetime, timedelta
from app.modules.shared.models import utcnow
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
import app.modules.models  # noqa: F401
from app.modules.finance import models as fmodels
from app.modules.finance.models import EntryStatus
from app.modules.finance.router import (
    EntryIn,
    EntryLineIn,
    ExpenseIn,
    RevenueIn,
    create_accounting_entry,
    ensure_default_accounting,
    journal_by_type,
    money,
    post_order_sale_entry,
    vat_declaration_totals,
)
from app.modules.finance.models import JournalType

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


class VatAutoCalcTests(unittest.TestCase):
    def test_expense_apply_vat_computes_19_25(self):
        e = ExpenseIn(amount=Decimal("10000"), apply_vat=True, description="Achat")
        self.assertEqual(e.tax_amount, Decimal("1925.00"))
        self.assertEqual(e.total_amount, Decimal("11925.00"))

    def test_revenue_apply_vat_computes_19_25(self):
        r = RevenueIn(amount=Decimal("10000"), apply_vat=True, description="Vente")
        self.assertEqual(r.tax_amount, Decimal("1925.00"))
        self.assertEqual(r.total_amount, Decimal("11925.00"))

    def test_apply_vat_off_keeps_zero(self):
        e = ExpenseIn(amount=Decimal("10000"), description="Achat")
        self.assertEqual(e.tax_amount, Decimal("0.00"))
        self.assertEqual(e.total_amount, Decimal("10000.00"))

    def test_explicit_tax_is_not_overwritten(self):
        e = ExpenseIn(amount=Decimal("10000"), tax_amount=Decimal("500"), apply_vat=True, description="Achat")
        self.assertEqual(e.tax_amount, Decimal("500.00"))


class VatDeclarationTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine, tables=FINANCE_TABLES)
        self.db = sessionmaker(bind=self.engine)()

    def tearDown(self):
        self.db.close()

    def _post_deductible(self, amount):
        accounts = ensure_default_accounting(self.db, RESTO)
        journal = journal_by_type(self.db, RESTO, JournalType.PURCHASE)
        payload = EntryIn(
            entry_date=utcnow(),
            journal_id=journal.id,
            description="Achat avec TVA",
            lines=[
                EntryLineIn(account_id=accounts["vat_deductible"].id, label="TVA déductible", debit=amount, credit=0),
                EntryLineIn(account_id=accounts["cash"].id, label="Paiement", debit=0, credit=amount),
            ],
        )
        create_accounting_entry(self.db, RESTO, USER, payload, status=EntryStatus.POSTED)

    def test_declaration_nets_collected_minus_deductible(self):
        # Vente TTC 11 925 -> TVA collectée 1 925
        from types import SimpleNamespace
        order = SimpleNamespace(id="cmd-1", restaurant_id=RESTO, total_amount=Decimal("11925"),
                                payment_method="Espèces", order_number="CMD-1", cashier_id=USER)
        post_order_sale_entry(self.db, RESTO, order, USER)
        # TVA déductible 1 000
        self._post_deductible(Decimal("1000"))
        self.db.commit()

        start = utcnow() - timedelta(days=1)
        end = utcnow() + timedelta(days=1)
        totals = vat_declaration_totals(self.db, RESTO, start, end)
        self.assertEqual(totals["vat_collected"], Decimal("1925.00"))
        self.assertEqual(totals["vat_deductible"], Decimal("1000.00"))
        self.assertEqual(totals["net_vat_due"], Decimal("925.00"))
        self.assertEqual(totals["vat_credit"], Decimal("0.00"))

    def test_declaration_credit_when_deductible_exceeds(self):
        self._post_deductible(Decimal("3000"))
        self.db.commit()
        start = utcnow() - timedelta(days=1)
        end = utcnow() + timedelta(days=1)
        totals = vat_declaration_totals(self.db, RESTO, start, end)
        self.assertEqual(totals["net_vat_due"], Decimal("0.00"))
        self.assertEqual(totals["vat_credit"], Decimal("3000.00"))


if __name__ == "__main__":
    unittest.main()
