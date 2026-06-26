"""P0-1a : les colonnes montants/quantités du stock sont en Decimal (jamais float).

Vérifie le round-trip Decimal (insert -> lecture) sur products et stock_movements.
"""
import unittest
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
import app.modules.models  # noqa: F401 - résolution FK
from app.modules.stock.models import Product, StockMovement, StockMovementType

STOCK_TABLES = [Product.__table__, StockMovement.__table__]


class StockDecimalColumnsTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine, tables=STOCK_TABLES)
        self.db = sessionmaker(bind=self.engine)()

    def tearDown(self):
        self.db.close()

    def test_product_amounts_roundtrip_as_decimal(self):
        product = Product(
            restaurant_id="resto-A",
            name="Farine",
            unit_id="unit-1",
            purchase_price=Decimal("1234.56"),
            minimum_stock=Decimal("2.500"),
            packaging_sale_price=Decimal("99.99"),
            sale_margin_rate=Decimal("0.1500"),
        )
        self.db.add(product)
        self.db.commit()
        self.db.expire_all()  # force relecture depuis la base

        loaded = self.db.query(Product).filter(Product.restaurant_id == "resto-A").one()
        self.assertIsInstance(loaded.purchase_price, Decimal)
        self.assertEqual(loaded.purchase_price, Decimal("1234.56"))
        self.assertIsInstance(loaded.minimum_stock, Decimal)
        self.assertEqual(loaded.minimum_stock, Decimal("2.500"))
        self.assertEqual(loaded.sale_margin_rate, Decimal("0.1500"))

    def test_movement_amounts_roundtrip_as_decimal(self):
        movement = StockMovement(
            restaurant_id="resto-A",
            movement_type=StockMovementType.ENTRY,
            product_id="prod-1",
            quantity=Decimal("3.250"),
            unit_price=Decimal("100.00"),
            total_amount=Decimal("325.00"),
        )
        self.db.add(movement)
        self.db.commit()
        self.db.expire_all()

        loaded = self.db.query(StockMovement).one()
        self.assertIsInstance(loaded.quantity, Decimal)
        self.assertEqual(loaded.quantity, Decimal("3.250"))
        self.assertIsInstance(loaded.total_amount, Decimal)
        self.assertEqual(loaded.total_amount, Decimal("325.00"))


if __name__ == "__main__":
    unittest.main()
