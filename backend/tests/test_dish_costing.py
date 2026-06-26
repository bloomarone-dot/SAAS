"""P2-3 : coût matière par plat (recette × CMUP + emballage)."""
import unittest
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
import app.modules.models  # noqa: F401
from app.modules.stock.models import (
    Product,
    StockItemPackaging,
    StockLocation,
    StockRecipeIngredient,
)
from app.modules.stock.router import compute_dish_costs
from tests._schema import STOCK_WITH_ACCOUNTING

RESTO = "resto-A"
DISH = "dish-1"


class DishCostingTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine, tables=STOCK_WITH_ACCOUNTING)
        self.db = sessionmaker(bind=self.engine)()
        self.tomate = Product(restaurant_id=RESTO, name="Tomate", unit_id="u1", cmup=Decimal("200.00"))
        self.huile = Product(restaurant_id=RESTO, name="Huile", unit_id="u1", cmup=Decimal("50.00"))
        self.barquette = Product(restaurant_id=RESTO, name="Barquette", unit_id="u1", cmup=Decimal("100.00"))
        self.db.add_all([self.tomate, self.huile, self.barquette])
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_material_cost_sums_recipe_and_packaging_at_cmup(self):
        self.db.add_all([
            StockRecipeIngredient(restaurant_id=RESTO, menu_item_id=DISH, stock_item_id=self.tomate.id,
                                  quantity_per_dish=Decimal("2"), location=StockLocation.CUISINE),
            StockRecipeIngredient(restaurant_id=RESTO, menu_item_id=DISH, stock_item_id=self.huile.id,
                                  quantity_per_dish=Decimal("3"), location=StockLocation.CUISINE),
            StockItemPackaging(restaurant_id=RESTO, menu_item_id=DISH, packaging_item_id=self.barquette.id,
                               required_quantity=Decimal("1")),
        ])
        self.db.commit()
        costs = compute_dish_costs(self.db, RESTO)
        # 2x200 + 3x50 + 1x100 = 650
        self.assertEqual(costs[DISH], Decimal("650.00"))

    def test_inactive_recipe_line_is_ignored(self):
        self.db.add(StockRecipeIngredient(restaurant_id=RESTO, menu_item_id=DISH, stock_item_id=self.tomate.id,
                                          quantity_per_dish=Decimal("2"), location=StockLocation.CUISINE, is_active=False))
        self.db.commit()
        self.assertNotIn(DISH, compute_dish_costs(self.db, RESTO))

    def test_dish_without_recipe_has_no_cost(self):
        self.assertEqual(compute_dish_costs(self.db, RESTO), {})


if __name__ == "__main__":
    unittest.main()
