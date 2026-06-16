"""Tests de la garde anti-double-paiement de `create_pending_transaction`.

Un seul paiement actif par facture (R1) : une facture verrouillée ou déjà en
paiement ne peut pas relancer un push. (La contrainte d'unicité DB
`uq_payment_active_order` complète cette garde applicative.)
"""
import unittest
from types import SimpleNamespace

from app.modules.payments.service import create_pending_transaction


class FakeDB:
    def add(self, *args, **kwargs):
        pass

    def flush(self):
        pass

    def commit(self):
        pass

    def refresh(self, *args, **kwargs):
        pass


def make_order(**overrides):
    base = dict(
        id="order-1",
        restaurant_id="resto-1",
        order_number="CMD-1",
        total_amount=5000.0,
        status="Prête",
        payment_locked=False,
        payment_previous_status=None,
        transaction_id=None,
        payment_status="En attente",
        payment_method="Espèces",
        cashier_id=None,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


class DoublePaymentGuardTests(unittest.TestCase):
    def test_locked_invoice_is_blocked(self):
        with self.assertRaises(ValueError):
            create_pending_transaction(FakeDB(), make_order(payment_locked=True), "ORANGE_CM", "690000000", "u1", "CAISSE")

    def test_pending_payment_status_is_blocked(self):
        with self.assertRaises(ValueError):
            create_pending_transaction(FakeDB(), make_order(status="PENDING_PAYMENT"), "ORANGE_CM", "690000000", "u1", "CAISSE")

    def test_non_payable_status_is_blocked(self):
        with self.assertRaises(ValueError):
            create_pending_transaction(FakeDB(), make_order(status="Nouvelle"), "ORANGE_CM", "690000000", "u1", "CAISSE")

    def test_happy_path_locks_invoice(self):
        order = make_order(status="Livrée")
        tx = create_pending_transaction(FakeDB(), order, "ORANGE_CM", "690000000", "u1", "CAISSE")
        self.assertEqual(tx.status, "PENDING")
        self.assertEqual(order.status, "PENDING_PAYMENT")
        self.assertTrue(order.payment_locked)
        self.assertEqual(tx.active_order_key, order.id)
        self.assertEqual(tx.amount, 5000.0)


if __name__ == "__main__":
    unittest.main()
