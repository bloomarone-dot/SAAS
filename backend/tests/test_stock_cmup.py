"""P0-2a : CMUP réel pondéré (moyenne pondérée aux entrées, sorties valuées au CMUP)."""
import unittest
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
import app.modules.models  # noqa: F401
from app.modules.stock.models import Depot, DepotType, Product, StockMovement, StockMovementType
from app.modules.stock.router import add_movement
from tests._schema import STOCK_WITH_ACCOUNTING

RESTO = "resto-A"
USER = "user-1"


class StockCmupTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine, tables=STOCK_WITH_ACCOUNTING)
        self.db = sessionmaker(bind=self.engine)()
        self.main = Depot(restaurant_id=RESTO, name="Magasin", code="MAIN", type=DepotType.PRINCIPAL, is_active=True)
        self.product = Product(restaurant_id=RESTO, name="Sucre", unit_id="u1",
                               purchase_price=Decimal("100.00"), cmup=Decimal("100.00"))
        self.db.add_all([self.main, self.product])
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def _entry(self, qty, price):
        return add_movement(self.db, restaurant_id=RESTO, user_id=USER, movement_type=StockMovementType.ENTRY,
                            product_id=self.product.id, destination_depot_id=self.main.id,
                            quantity=qty, unit_price=price)

    def test_weighted_average_after_two_entries(self):
        self._entry(Decimal("10"), Decimal("100.00"))
        self.db.commit()
        self.assertEqual(self.product.cmup, Decimal("100.00"))

        self._entry(Decimal("10"), Decimal("200.00"))  # (10*100 + 10*200)/20 = 150
        self.db.commit()
        self.assertEqual(self.product.cmup, Decimal("150.00"))

    def test_output_is_valued_at_cmup_not_purchase_price(self):
        self._entry(Decimal("10"), Decimal("100.00"))
        self._entry(Decimal("10"), Decimal("200.00"))  # cmup -> 150
        self.db.commit()

        output = add_movement(self.db, restaurant_id=RESTO, user_id=USER, movement_type=StockMovementType.OUTPUT,
                              product_id=self.product.id, source_depot_id=self.main.id, quantity=Decimal("5"))
        self.db.commit()
        self.assertEqual(output.unit_price, Decimal("150.00"))
        self.assertEqual(output.total_amount, Decimal("750.00"))  # 5 x 150

    def test_first_entry_on_empty_stock_sets_cmup(self):
        product = Product(restaurant_id=RESTO, name="Sel", unit_id="u1", purchase_price=Decimal("0"), cmup=Decimal("0"))
        self.db.add(product)
        self.db.commit()
        add_movement(self.db, restaurant_id=RESTO, user_id=USER, movement_type=StockMovementType.ENTRY,
                     product_id=product.id, destination_depot_id=self.main.id,
                     quantity=Decimal("4"), unit_price=Decimal("250.00"))
        self.db.commit()
        self.assertEqual(product.cmup, Decimal("250.00"))


if __name__ == "__main__":
    unittest.main()
