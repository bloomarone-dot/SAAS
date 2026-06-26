"""P0-1b : arithmétique stock 100 % Decimal (mouvements, valorisation, stock négatif)."""
import unittest
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
import app.modules.models  # noqa: F401
from app.modules.stock.models import Depot, DepotType, Product, StockMovement, StockMovementType
from app.modules.stock.router import add_movement, get_current_stock
from tests._schema import STOCK_WITH_ACCOUNTING

RESTO = "resto-A"
USER = "user-1"


class StockDecimalArithmeticTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine, tables=STOCK_WITH_ACCOUNTING)
        self.db = sessionmaker(bind=self.engine)()
        self.main = Depot(restaurant_id=RESTO, name="Magasin", code="MAIN", type=DepotType.PRINCIPAL, is_active=True)
        self.kitchen = Depot(restaurant_id=RESTO, name="Cuisine", code="KITCHEN", type=DepotType.CUISINE, is_active=True)
        self.product = Product(restaurant_id=RESTO, name="Farine", unit_id="u1", purchase_price=Decimal("150.50"))
        self.db.add_all([self.main, self.kitchen, self.product])
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def _entry(self, qty, price=None, depot=None):
        return add_movement(
            self.db, restaurant_id=RESTO, user_id=USER, movement_type=StockMovementType.ENTRY,
            product_id=self.product.id, destination_depot_id=(depot or self.main).id,
            quantity=qty, unit_price=price,
        )

    def test_entry_then_output_stock_is_decimal(self):
        self._entry(Decimal("10"))
        self.db.commit()
        stock = get_current_stock(self.db, self.product.id, restaurant_id=RESTO)
        self.assertIsInstance(stock, Decimal)
        self.assertEqual(stock, Decimal("10"))

        add_movement(self.db, restaurant_id=RESTO, user_id=USER, movement_type=StockMovementType.OUTPUT,
                     product_id=self.product.id, source_depot_id=self.main.id, quantity=Decimal("3.250"))
        self.db.commit()
        self.assertEqual(get_current_stock(self.db, self.product.id, restaurant_id=RESTO), Decimal("6.750"))

    def test_entry_valuation_is_exact_decimal(self):
        movement = self._entry(Decimal("10"), price=Decimal("150.50"))
        self.db.commit()
        self.assertIsInstance(movement.total_amount, Decimal)
        self.assertEqual(movement.total_amount, Decimal("1505.00"))

    def test_transfer_moves_between_depots(self):
        self._entry(Decimal("10"))
        self.db.commit()
        add_movement(self.db, restaurant_id=RESTO, user_id=USER, movement_type=StockMovementType.TRANSFER,
                     product_id=self.product.id, source_depot_id=self.main.id, destination_depot_id=self.kitchen.id,
                     quantity=Decimal("4"))
        self.db.commit()
        self.assertEqual(get_current_stock(self.db, self.product.id, self.main.id, RESTO), Decimal("6"))
        self.assertEqual(get_current_stock(self.db, self.product.id, self.kitchen.id, RESTO), Decimal("4"))
        self.assertEqual(get_current_stock(self.db, self.product.id, restaurant_id=RESTO), Decimal("10"))

    def test_negative_stock_is_blocked(self):
        self._entry(Decimal("5"))
        self.db.commit()
        with self.assertRaises(HTTPException) as ctx:
            add_movement(self.db, restaurant_id=RESTO, user_id=USER, movement_type=StockMovementType.OUTPUT,
                         product_id=self.product.id, source_depot_id=self.main.id, quantity=Decimal("100"))
        self.assertEqual(ctx.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
