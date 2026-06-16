import unittest
from types import SimpleNamespace

from app.modules.payments.service import create_payment_request, reject_payment_request


class FakeQuery:
    def __init__(self, result):
        self._result = result

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        return self._result


class FakeSession:
    """Session minimale : supporte query/add/commit/refresh sans base réelle."""

    def __init__(self, existing_request=None):
        self.existing_request = existing_request
        self.added = []
        self.commits = 0

    def query(self, _model):
        return FakeQuery(self.existing_request)

    def add(self, obj):
        self.added.append(obj)

    def commit(self):
        self.commits += 1

    def refresh(self, _obj):
        return None


def make_order(**overrides):
    base = dict(
        id="order-1",
        restaurant_id="restaurant-1",
        order_number="CMD-1",
        total_amount=5000.0,
        status="Livrée",
        payment_locked=False,
        is_closed=False,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def make_user():
    return SimpleNamespace(id="user-1", first_name="Jean", last_name="Mballa", username="jean")


def added_titles(db):
    return [getattr(item, "title", None) for item in db.added]


class CreatePaymentRequestTests(unittest.TestCase):
    def test_create_mobile_request_happy_path_notifies_cashier(self):
        db = FakeSession()
        req = create_payment_request(db, make_order(), "ORANGE", "690000000", None, make_user())

        self.assertEqual(req.status, "PENDING")
        self.assertEqual(req.method, "ORANGE")
        self.assertEqual(req.payer_msisdn, "690000000")
        self.assertEqual(req.amount, 5000.0)
        self.assertEqual(req.requested_by_name, "Jean Mballa")
        self.assertEqual(req.requested_by_id, "user-1")
        self.assertIn("Nouvelle demande de paiement", added_titles(db))
        self.assertEqual(db.commits, 1)

    def test_cash_request_is_allowed_without_msisdn(self):
        db = FakeSession()
        req = create_payment_request(db, make_order(), "CASH", None, None, make_user())
        self.assertEqual(req.method, "CASH")
        self.assertIsNone(req.payer_msisdn)

    def test_closed_order_is_eligible_even_when_status_not_finalized(self):
        db = FakeSession()
        order = make_order(status="En préparation", is_closed=True)
        req = create_payment_request(db, order, "MTN", "670000000", None, make_user())
        self.assertEqual(req.status, "PENDING")

    def test_open_order_with_non_finalized_status_is_rejected(self):
        db = FakeSession()
        order = make_order(status="En préparation", is_closed=False)
        with self.assertRaises(ValueError):
            create_payment_request(db, order, "ORANGE", "690000000", None, make_user())

    def test_paid_order_is_rejected(self):
        db = FakeSession()
        with self.assertRaises(ValueError):
            create_payment_request(db, make_order(status="Payée"), "CASH", None, None, make_user())

    def test_locked_order_is_rejected(self):
        db = FakeSession()
        with self.assertRaises(ValueError):
            create_payment_request(db, make_order(payment_locked=True), "ORANGE", "690000000", None, make_user())

    def test_duplicate_pending_request_is_rejected(self):
        db = FakeSession(existing_request=SimpleNamespace(id="pr-existing", status="PENDING"))
        with self.assertRaises(ValueError):
            create_payment_request(db, make_order(), "ORANGE", "690000000", None, make_user())


class RejectPaymentRequestTests(unittest.TestCase):
    def test_reject_sets_status_and_notifies_owner(self):
        db = FakeSession()
        req = SimpleNamespace(
            id="pr-1",
            restaurant_id="restaurant-1",
            status="PENDING",
            requested_by_id="user-1",
            method="ORANGE",
            validated_by_id=None,
        )
        reject_payment_request(db, req, make_user(), "CMD-1")

        self.assertEqual(req.status, "REJECTED")
        self.assertEqual(req.validated_by_id, "user-1")
        self.assertIn("Demande de paiement rejetée", added_titles(db))
        self.assertEqual(db.commits, 1)


if __name__ == "__main__":
    unittest.main()
