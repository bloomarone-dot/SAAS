"""La période caisse doit couvrir toute la journée, pas seulement minuit."""
import unittest
from datetime import datetime, time

from app.modules.orders.router import cashier_period


class CashierPeriodTests(unittest.TestCase):
    def test_date_only_expands_end_of_day(self):
        start, end = cashier_period(
            datetime(2026, 8, 3, 0, 0, 0),
            datetime(2026, 8, 3, 0, 0, 0),
        )
        self.assertEqual(start, datetime(2026, 8, 3, 0, 0, 0))
        self.assertEqual(end.date(), datetime(2026, 8, 3).date())
        self.assertEqual(end.time(), time.max)

    def test_full_datetime_kept(self):
        start, end = cashier_period(
            datetime(2026, 8, 3, 0, 0, 0),
            datetime(2026, 8, 3, 23, 59, 59),
        )
        self.assertEqual(end, datetime(2026, 8, 3, 23, 59, 59))

    def test_payment_midday_is_inside_range(self):
        start, end = cashier_period(
            datetime(2026, 8, 3, 0, 0, 0),
            datetime(2026, 8, 3, 0, 0, 0),
        )
        paid_at = datetime(2026, 8, 3, 13, 30, 0)
        self.assertTrue(start <= paid_at <= end)


if __name__ == "__main__":
    unittest.main()
