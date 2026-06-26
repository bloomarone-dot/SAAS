"""P2-6 : export FEC (Fichier des Écritures Comptables) — texte tabulé normalisé."""
import unittest
from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
import app.modules.models  # noqa: F401
from app.modules.shared.models import utcnow
from app.modules.finance import models as fmodels
from app.modules.finance.router import FEC_HEADER, build_fec_rows, post_order_sale_entry

RESTO = "resto-A"
USER = "user-1"

FINANCE_TABLES = [
    t.__table__ for t in (
        fmodels.AccountingAccount, fmodels.AccountingJournal, fmodels.AccountingEntry,
        fmodels.AccountingEntryLine, fmodels.CashRegister, fmodels.BankAccount,
        fmodels.ExpenseCategory, fmodels.AccountingPeriodClose,
    )
]


class FecExportTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine, tables=FINANCE_TABLES)
        self.db = sessionmaker(bind=self.engine)()
        order = SimpleNamespace(id="cmd-1", restaurant_id=RESTO, total_amount=Decimal("11925"),
                                payment_method="Espèces", order_number="CMD-1", cashier_id=USER)
        post_order_sale_entry(self.db, RESTO, order, USER)  # 11925 TTC -> 10000 HT + 1925 TVA
        self.db.commit()
        self.start = utcnow() - timedelta(days=1)
        self.end = utcnow() + timedelta(days=1)

    def tearDown(self):
        self.db.close()

    def test_header_and_18_columns(self):
        rows = build_fec_rows(self.db, RESTO, self.start, self.end)
        self.assertEqual(rows[0], FEC_HEADER)
        self.assertEqual(len(FEC_HEADER), 18)
        self.assertGreaterEqual(len(rows), 4)  # en-tête + 3 lignes (trésorerie, 701, 4457)
        for row in rows:
            self.assertEqual(len(row), 18)

    def test_amounts_use_comma_and_dates_are_yyyymmdd(self):
        rows = build_fec_rows(self.db, RESTO, self.start, self.end)
        data = rows[1:]
        # Une ligne de débit trésorerie de 11925,00
        debit_cells = [r[11] for r in data if r[11] not in ("", "0,00")]
        self.assertIn("11925,00", debit_cells)
        # Dates EcritureDate = 8 chiffres
        for r in data:
            self.assertRegex(r[3], r"^\d{8}$")

    def test_entries_are_balanced(self):
        rows = build_fec_rows(self.db, RESTO, self.start, self.end)[1:]
        to_dec = lambda s: Decimal(s.replace(",", ".")) if s else Decimal("0")
        total_debit = sum(to_dec(r[11]) for r in rows)
        total_credit = sum(to_dec(r[12]) for r in rows)
        self.assertEqual(total_debit, total_credit)
        self.assertEqual(total_debit, Decimal("11925.00"))


if __name__ == "__main__":
    unittest.main()
