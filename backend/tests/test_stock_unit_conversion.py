"""P2-2 : conversions multi-unités (réception en unité d'achat -> unité de stock)."""
import unittest
from datetime import datetime
from app.modules.shared.models import utcnow
from decimal import Decimal
from types import SimpleNamespace

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
import app.modules.models  # noqa: F401
from app.modules.permissions.models import Role
from app.modules.stock.models import Depot, DepotType, Product, StockMovementType
from app.modules.stock.router import create_stock_entry, get_current_stock
from app.modules.stock.schemas import StockEntryIn
from app.modules.users.models import User
from tests._schema import STOCK_WITH_ACCOUNTING

RESTO = "resto-A"
USER = "user-1"


class StockUnitConversionTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine, tables=STOCK_WITH_ACCOUNTING)
        self.db = sessionmaker(bind=self.engine)()
        self.main = Depot(restaurant_id=RESTO, name="Magasin", code="MAIN", type=DepotType.PRINCIPAL, is_active=True)
        # 1 sac = 50 kg ; stock & CMUP en kg.
        self.product = Product(restaurant_id=RESTO, name="Riz", unit_id="u-kg",
                               purchase_unit_id="u-sac", purchase_factor=Decimal("50"),
                               purchase_price=Decimal("0"), cmup=Decimal("0"), minimum_stock=Decimal("0"))
        self.db.add_all([
            self.main, self.product,
            User(id=USER, username="u", first_name="A", last_name="B", password_hash="x",
                 role=Role.ADMIN, restaurant_id=RESTO, is_owner=True, is_active=True, created_at=utcnow()),
        ])
        self.db.commit()
        self.user = SimpleNamespace(id=USER, restaurant_id=RESTO)

    def tearDown(self):
        self.db.close()

    def test_reception_in_purchase_unit_converts_to_base(self):
        # 2 sacs @ 50 000 FCFA le sac -> 100 kg @ 1 000 FCFA/kg.
        payload = StockEntryIn(product_id=self.product.id, destination_depot_id=self.main.id,
                               quantity=2, unit_price=50000, in_purchase_unit=True)
        movement = create_stock_entry(payload, self.user, self.db, StockMovementType.ENTRY)

        self.assertEqual(movement.quantity, Decimal("100.000"))
        self.assertEqual(movement.unit_price, Decimal("1000.00"))
        self.assertEqual(movement.total_amount, Decimal("100000.00"))  # pas de dérive d'arrondi
        self.assertEqual(get_current_stock(self.db, self.product.id, restaurant_id=RESTO), Decimal("100.000"))
        self.db.refresh(self.product)
        self.assertEqual(self.product.cmup, Decimal("1000.00"))

    def test_reception_in_base_unit_is_unchanged(self):
        payload = StockEntryIn(product_id=self.product.id, destination_depot_id=self.main.id,
                               quantity=10, unit_price=1200, in_purchase_unit=False)
        movement = create_stock_entry(payload, self.user, self.db, StockMovementType.ENTRY)
        self.assertEqual(movement.quantity, Decimal("10.000"))
        self.assertEqual(movement.unit_price, Decimal("1200.00"))


if __name__ == "__main__":
    unittest.main()
