"""P2-5b : échéancier (échéances à payer/encaisser, détection des retards)."""
import unittest
from datetime import datetime, timedelta
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
import app.modules.models  # noqa: F401
from app.modules.finance.models import PaymentSchedule
from app.modules.finance.router import payment_schedule_summary

RESTO = "resto-A"
USER = "user-1"
NOW = datetime(2026, 6, 15, 12, 0, 0)


class PaymentScheduleTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine, tables=[PaymentSchedule.__table__])
        self.db = sessionmaker(bind=self.engine)()

    def tearDown(self):
        self.db.close()

    def _add(self, direction, amount, days, status="pending"):
        self.db.add(PaymentSchedule(
            restaurant_id=RESTO, direction=direction, label="x", created_by=USER,
            due_date=NOW + timedelta(days=days), amount=Decimal(amount), status=status,
        ))

    def test_summary_totals_and_overdue(self):
        self._add("payable", "1000", -2)      # en retard
        self._add("payable", "500", 3)        # à venir
        self._add("receivable", "2000", -1)   # en retard
        self._add("payable", "9999", -5, status="paid")  # payée -> exclue
        self.db.commit()

        summary = payment_schedule_summary(self.db, RESTO, now=NOW)
        self.assertEqual(summary["payable"]["total"], Decimal("1500.00"))
        self.assertEqual(summary["payable"]["overdue_total"], Decimal("1000.00"))
        self.assertEqual(summary["receivable"]["total"], Decimal("2000.00"))
        self.assertEqual(summary["receivable"]["overdue_total"], Decimal("2000.00"))
        self.assertEqual(len(summary["payable"]["items"]), 2)

    def test_overdue_flag_per_item(self):
        self._add("payable", "100", -1)
        self._add("payable", "200", 10)
        self.db.commit()
        items = payment_schedule_summary(self.db, RESTO, now=NOW)["payable"]["items"]
        flags = {i["amount"]: i["overdue"] for i in items}
        self.assertTrue(flags[Decimal("100.00")])
        self.assertFalse(flags[Decimal("200.00")])


if __name__ == "__main__":
    unittest.main()
