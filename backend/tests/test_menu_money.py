"""Les prix menu restent des entiers FCFA (1500 ne devient pas 1445 / 1499)."""
import unittest
from datetime import datetime
from decimal import Decimal

from app.modules.menu.schemas import DishCreate, DishResponse, DishUpdate, _round_money


class MenuMoneyTests(unittest.TestCase):
    def test_round_money_keeps_whole_fcfa(self):
        self.assertEqual(_round_money(1500), 1500.0)
        self.assertEqual(_round_money(1500.0), 1500.0)
        self.assertEqual(_round_money(Decimal("1500.00")), 1500.0)
        self.assertEqual(_round_money("1500"), 1500.0)
        self.assertEqual(_round_money("1 500"), 1500.0)
        self.assertEqual(_round_money("1.500"), 1500.0)
        self.assertEqual(_round_money("14999.6"), 15000.0)

    def test_dish_create_preserves_1500(self):
        dish = DishCreate(name="Jus Bissap", price=1500, category_id="cat-1")
        self.assertEqual(dish.price, 1500.0)

    def test_dish_update_preserves_1500(self):
        dish = DishUpdate(price=1500)
        self.assertEqual(dish.price, 1500.0)

    def test_dish_response_rounds_decimal(self):
        response = DishResponse(
            id="d1",
            restaurant_id="r1",
            name="Jus Bissap",
            price=Decimal("1500.00"),
            cost_per_dish=Decimal("0"),
            is_available=True,
            created_at=datetime(2026, 7, 31, 12, 0, 0),
        )
        self.assertEqual(response.price, 1500.0)


if __name__ == "__main__":
    unittest.main()
