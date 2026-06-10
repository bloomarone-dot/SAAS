import hashlib
import hmac
import unittest
from datetime import datetime
from types import SimpleNamespace

from app.modules.payments.service import apply_webhook
from app.security import verify_hmac_sha256_signature


class FakeSession:
    def __init__(self, order):
        self.order = order
        self.added = []
        self.commits = 0

    def add(self, value):
        self.added.append(value)

    def get(self, model, entity_id):
        return self.order if entity_id == self.order.id else None

    def commit(self):
        self.commits += 1


def make_transaction(status="PENDING"):
    return SimpleNamespace(
        id="tx-1",
        restaurant_id="restaurant-1",
        order_id="order-1",
        provider="ORANGE_CM",
        provider_tx_id=None,
        amount=10000.0,
        status=status,
        failure_reason=None,
        active_order_key="order-1",
        aggregator_fee=None,
        bloomar_commission=None,
        restaurant_net=None,
        raw_webhook=None,
        webhook_received_at=None,
        completed_at=None,
    )


def make_order():
    return SimpleNamespace(
        id="order-1",
        order_number="CMD-1",
        status="PENDING_PAYMENT",
        payment_status="PENDING",
        payment_locked=True,
        payment_previous_status="Livrée",
        transaction_id="tx-1",
        payment_method="Orange Money",
    )


class MobileMoneyPaymentTests(unittest.TestCase):
    def test_signed_webhook_success_freezes_financial_split(self):
        order = make_order()
        tx = make_transaction()
        db = FakeSession(order)

        changed = apply_webhook(
            db,
            tx,
            {"status": "SUCCESS", "txnid": "provider-1"},
            "SUCCESS",
        )

        self.assertTrue(changed)
        self.assertEqual(tx.status, "SUCCESS")
        self.assertEqual(tx.aggregator_fee, 119.25)
        self.assertEqual(tx.bloomar_commission, 0.0)
        self.assertEqual(tx.restaurant_net, 9880.75)
        self.assertIsInstance(tx.webhook_received_at, datetime)
        self.assertEqual(order.status, "Payée")
        self.assertEqual(order.payment_status, "SUCCESS")
        self.assertFalse(order.payment_locked)

    def test_duplicate_success_webhook_is_idempotent(self):
        order = make_order()
        tx = make_transaction(status="SUCCESS")
        tx.aggregator_fee = 119.25
        tx.restaurant_net = 9880.75
        db = FakeSession(order)

        changed = apply_webhook(db, tx, {"status": "SUCCESS"}, "SUCCESS")

        self.assertFalse(changed)
        self.assertEqual(tx.aggregator_fee, 119.25)
        self.assertEqual(tx.restaurant_net, 9880.75)

    def test_failed_webhook_unlocks_invoice(self):
        order = make_order()
        tx = make_transaction()
        db = FakeSession(order)

        apply_webhook(db, tx, {"status": "FAILED", "message": "Refusé"}, "FAILED")

        self.assertEqual(tx.status, "FAILED")
        self.assertIsNone(tx.active_order_key)
        self.assertEqual(order.status, "Livrée")
        self.assertEqual(order.payment_status, "FAILED")
        self.assertFalse(order.payment_locked)

    def test_hmac_signature_validation(self):
        body = b'{"status":"SUCCESS"}'
        secret = "webhook-secret"
        signature = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()

        self.assertTrue(verify_hmac_sha256_signature(body, f"sha256={signature}", secret))
        self.assertFalse(verify_hmac_sha256_signature(body + b" ", signature, secret))


if __name__ == "__main__":
    unittest.main()
