"""P2-7 : get_current_stock par agrégation SQL + batch stock_totals_map (anti N+1)."""
import unittest
from datetime import datetime
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
import app.modules.models  # noqa: F401
from app.modules.shared.models import utcnow
from app.modules.permissions.models import Role
from app.modules.stock.models import Depot, DepotType, Product, StockMovementType
from app.modules.stock.router import add_movement, get_current_stock, stock_totals_map
from app.modules.users.models import User
from tests._schema import STOCK_WITH_ACCOUNTING

RESTO = "resto-A"
USER = "user-1"


class StockAggregationTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine, tables=STOCK_WITH_ACCOUNTING)
        self.db = sessionmaker(bind=self.engine)()
        self.main = Depot(restaurant_id=RESTO, name="Magasin", code="MAIN", type=DepotType.PRINCIPAL, is_active=True)
        self.kitchen = Depot(restaurant_id=RESTO, name="Cuisine", code="KITCHEN", type=DepotType.CUISINE, is_active=True)
        self.a = Product(restaurant_id=RESTO, name="A", unit_id="u1", cmup=Decimal("100"))
        self.b = Product(restaurant_id=RESTO, name="B", unit_id="u1", cmup=Decimal("100"))
        self.db.add_all([
            self.main, self.kitchen, self.a, self.b,
            User(id=USER, username="u", first_name="A", last_name="B", password_hash="x",
                 role=Role.ADMIN, restaurant_id=RESTO, is_owner=True, is_active=True, created_at=utcnow()),
        ])
        self.db.commit()
        self._entry(self.a, Decimal("10"), self.main)
        self._entry(self.b, Decimal("5"), self.main)
        add_movement(self.db, restaurant_id=RESTO, user_id=USER, movement_type=StockMovementType.OUTPUT,
                     product_id=self.a.id, source_depot_id=self.main.id, quantity=Decimal("3"))
        add_movement(self.db, restaurant_id=RESTO, user_id=USER, movement_type=StockMovementType.TRANSFER,
                     product_id=self.a.id, source_depot_id=self.main.id, destination_depot_id=self.kitchen.id, quantity=Decimal("4"))
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def _entry(self, product, qty, depot):
        add_movement(self.db, restaurant_id=RESTO, user_id=USER, movement_type=StockMovementType.ENTRY,
                     product_id=product.id, destination_depot_id=depot.id, quantity=qty)

    def test_all_depots_nets_transfers(self):
        self.assertEqual(get_current_stock(self.db, self.a.id, restaurant_id=RESTO), Decimal("7"))  # 10 - 3

    def test_per_depot(self):
        self.assertEqual(get_current_stock(self.db, self.a.id, self.main.id, RESTO), Decimal("3"))    # 10 -3 -4
        self.assertEqual(get_current_stock(self.db, self.a.id, self.kitchen.id, RESTO), Decimal("4"))  # transfert reçu

    def test_batch_map_matches_per_product(self):
        totals = stock_totals_map(self.db, RESTO)
        self.assertEqual(totals[self.a.id], Decimal("7"))
        self.assertEqual(totals[self.b.id], Decimal("5"))

    def test_tenant_scoping(self):
        # Aucun mouvement pour un autre tenant -> 0.
        self.assertEqual(get_current_stock(self.db, self.a.id, restaurant_id="autre"), Decimal("0"))


if __name__ == "__main__":
    unittest.main()
