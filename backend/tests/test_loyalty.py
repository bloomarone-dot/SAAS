"""Carte fidélité : 9 plats → 10e offert."""
import unittest
from types import SimpleNamespace

import app.modules.models  # noqa: F401

from app.modules.loyalty.service import (
    LOYALTY_CYCLE,
    count_loyalty_dishes,
    normalize_loyalty_phone,
    preview_loyalty,
)


def make_order(phone="657000000", stamps_card=None, items=None):
    order = SimpleNamespace(
        restaurant_id="r1",
        customer_phone=phone,
        customer_name="Client Test",
        discount_amount=0,
        delivery_fee=0,
        total_amount=0,
        notes="",
        items=items
        or [
            SimpleNamespace(name="Poulet", quantity=1, unit_price=2000, line_total=2000, sale_channel="REPAS"),
            SimpleNamespace(name="Riz", quantity=1, unit_price=1000, line_total=1000, sale_channel="REPAS"),
        ],
    )
    return order


class LoyaltyUnitTests(unittest.TestCase):
    def test_normalize_phone(self):
        self.assertEqual(normalize_loyalty_phone("+237 657 000 000"), "657000000")
        self.assertEqual(normalize_loyalty_phone("0657000000"), "657000000")

    def test_count_skips_packaging(self):
        order = make_order(
            items=[
                SimpleNamespace(quantity=2, unit_price=1000, line_total=2000, sale_channel="REPAS"),
                SimpleNamespace(quantity=1, unit_price=200, line_total=200, sale_channel="EMBALLAGE"),
            ]
        )
        self.assertEqual(count_loyalty_dishes(order), 2)

    def test_preview_grants_free_on_tenth(self):
        class FakeQuery:
            def __init__(self, card):
                self.card = card

            def filter(self, *a, **k):
                return self

            def one_or_none(self):
                return self.card

        class FakeDB:
            def __init__(self, card):
                self.card = card

            def query(self, model):
                return FakeQuery(self.card)

        card = SimpleNamespace(stamps=9, customer_name="A", phone="657000000")
        order = make_order(
            items=[SimpleNamespace(quantity=1, unit_price=2500, line_total=2500, sale_channel="REPAS")]
        )
        preview = preview_loyalty(FakeDB(card), order)
        self.assertEqual(preview["free_dishes"], 1)
        self.assertEqual(preview["discount_amount"], 2500.0)
        self.assertEqual(preview["stamps_after"], 0)
        self.assertEqual(LOYALTY_CYCLE, 10)


if __name__ == "__main__":
    unittest.main()
