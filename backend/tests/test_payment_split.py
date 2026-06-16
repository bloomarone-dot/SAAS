import unittest
from decimal import Decimal

from app.modules.payments.service import compute_payment_split


class PaymentSplitTests(unittest.TestCase):
    def test_aggregator_fee_formula_without_bloomar_commission(self):
        # 10000 × 1% × 1.1925 = 119.25 ; net = 10000 - 119.25 - 0
        split = compute_payment_split(Decimal("10000"), Decimal("0"))
        self.assertEqual(split["aggregator_fee"], Decimal("119.25"))
        self.assertEqual(split["bloomar_commission"], Decimal("0.00"))
        self.assertEqual(split["restaurant_net"], Decimal("9880.75"))

    def test_bloomar_commission_applied_on_gross(self):
        # commission Bloomar 2% sur 10000 = 200.00
        split = compute_payment_split(Decimal("10000"), Decimal("2"))
        self.assertEqual(split["aggregator_fee"], Decimal("119.25"))
        self.assertEqual(split["bloomar_commission"], Decimal("200.00"))
        self.assertEqual(split["restaurant_net"], Decimal("9680.75"))

    def test_split_is_conservative_sum_equals_gross(self):
        # Invariant comptable : agrégateur + Bloomar + net == brut (au centime près).
        for gross in ("0", "1500", "23750", "999999", "12345.67"):
            for rate in ("0", "1.5", "3", "7.25"):
                split = compute_payment_split(Decimal(gross), Decimal(rate))
                total = split["aggregator_fee"] + split["bloomar_commission"] + split["restaurant_net"]
                self.assertEqual(total, Decimal(gross), f"gross={gross} rate={rate}")

    def test_amounts_are_quantized_to_two_decimals(self):
        split = compute_payment_split(Decimal("33333"), Decimal("1.5"))
        for value in split.values():
            self.assertEqual(value, value.quantize(Decimal("0.01")))

    def test_zero_gross_yields_zero_everywhere(self):
        split = compute_payment_split(Decimal("0"), Decimal("5"))
        self.assertEqual(split["aggregator_fee"], Decimal("0.00"))
        self.assertEqual(split["bloomar_commission"], Decimal("0.00"))
        self.assertEqual(split["restaurant_net"], Decimal("0.00"))


if __name__ == "__main__":
    unittest.main()
