import unittest
from types import SimpleNamespace

from app.modules.orders.payment_reporting import (
    aggregate_payment_methods,
    classify_payment_bucket,
    order_payment_breakdown,
)


class PaymentReportingTests(unittest.TestCase):
    def test_split_payment_breakdown(self):
        order = SimpleNamespace(
            total_amount=94500,
            payment_method="Mixte (Espèces + Mobile Money)",
            cash_paid_amount=93500,
            mobile_paid_amount=1000,
        )
        self.assertEqual(
            order_payment_breakdown(order),
            {"Espèces": 93500.0, "Mobile Money": 1000.0},
        )

    def test_payment_intent_on_paid_order_counts_as_cash(self):
        self.assertEqual(classify_payment_bucket("Paiement à la livraison"), "Espèces")

    def test_aggregate_normalizes_mobile_and_cash(self):
        orders = [
            SimpleNamespace(total_amount=1000, payment_method="Orange Money", cash_paid_amount=None, mobile_paid_amount=None),
            SimpleNamespace(total_amount=500, payment_method="Espèces", cash_paid_amount=None, mobile_paid_amount=None),
        ]
        self.assertEqual(
            aggregate_payment_methods(orders),
            {"Mobile Money": 1000.0, "Espèces": 500.0},
        )


if __name__ == "__main__":
    unittest.main()
