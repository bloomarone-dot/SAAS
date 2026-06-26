"""P2-1 : lots & péremption + consommation FEFO (premier périmé, premier sorti)."""
import unittest
from datetime import timedelta
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
import app.modules.models  # noqa: F401
from app.modules.shared.models import utcnow
from app.modules.permissions.models import Role
from app.modules.stock.models import Depot, DepotType, Product, StockLot, StockMovementType
from app.modules.stock.router import add_movement, consume_lots_fefo
from app.modules.users.models import User
from tests._schema import STOCK_WITH_ACCOUNTING

RESTO = "resto-A"
USER = "user-1"
PROD = "prod-1"
DEPOT = "depot-1"


class FefoTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine, tables=[StockLot.__table__])
        self.db = sessionmaker(bind=self.engine)()
        now = utcnow()
        self.far = self._lot("L-FAR", now + timedelta(days=10), Decimal("5"))
        self.near = self._lot("L-NEAR", now + timedelta(days=2), Decimal("3"))
        self.none = self._lot("L-NONE", None, Decimal("10"))
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def _lot(self, number, expiry, qty):
        lot = StockLot(restaurant_id=RESTO, product_id=PROD, depot_id=DEPOT, lot_number=number,
                       expiry_date=expiry, quantity_initial=qty, quantity_remaining=qty, unit_cost=Decimal("100"))
        self.db.add(lot)
        return lot

    def _remaining(self, number):
        return self.db.query(StockLot).filter(StockLot.lot_number == number).one().quantity_remaining

    def test_consumes_earliest_expiry_first(self):
        consume_lots_fefo(self.db, RESTO, PROD, DEPOT, Decimal("6"))  # near(3) + far(3)
        self.db.commit()
        self.assertEqual(self._remaining("L-NEAR"), Decimal("0"))
        self.assertEqual(self._remaining("L-FAR"), Decimal("2"))
        self.assertEqual(self._remaining("L-NONE"), Decimal("10"))  # non daté non touché

    def test_undated_consumed_after_dated(self):
        consume_lots_fefo(self.db, RESTO, PROD, DEPOT, Decimal("10"))  # near3 + far5 + none2
        self.db.commit()
        self.assertEqual(self._remaining("L-NEAR"), Decimal("0"))
        self.assertEqual(self._remaining("L-FAR"), Decimal("0"))
        self.assertEqual(self._remaining("L-NONE"), Decimal("8"))

    def test_no_lots_is_noop(self):
        consume_lots_fefo(self.db, RESTO, "autre-produit", DEPOT, Decimal("5"))  # ne doit pas lever
        self.db.commit()


class FefoIntegrationTests(unittest.TestCase):
    """add_movement OUTPUT décharge les lots du dépôt source en FEFO."""

    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine, tables=STOCK_WITH_ACCOUNTING)
        self.db = sessionmaker(bind=self.engine)()
        self.depot = Depot(restaurant_id=RESTO, name="Magasin", code="MAIN", type=DepotType.PRINCIPAL, is_active=True)
        self.product = Product(restaurant_id=RESTO, name="Yaourt", unit_id="u1", cmup=Decimal("100"))
        self.db.add_all([
            self.depot, self.product,
            User(id=USER, username="u", first_name="A", last_name="B", password_hash="x",
                 role=Role.ADMIN, restaurant_id=RESTO, is_owner=True, is_active=True, created_at=utcnow()),
        ])
        self.db.commit()
        # Stock + 2 lots dans le dépôt
        add_movement(self.db, restaurant_id=RESTO, user_id=USER, movement_type=StockMovementType.ENTRY,
                     product_id=self.product.id, destination_depot_id=self.depot.id, quantity=Decimal("8"), unit_price=Decimal("100"))
        now = utcnow()
        self.db.add_all([
            StockLot(restaurant_id=RESTO, product_id=self.product.id, depot_id=self.depot.id, lot_number="A",
                     expiry_date=now + timedelta(days=1), quantity_initial=Decimal("3"), quantity_remaining=Decimal("3"), unit_cost=Decimal("100")),
            StockLot(restaurant_id=RESTO, product_id=self.product.id, depot_id=self.depot.id, lot_number="B",
                     expiry_date=now + timedelta(days=20), quantity_initial=Decimal("5"), quantity_remaining=Decimal("5"), unit_cost=Decimal("100")),
        ])
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_output_consumes_lots_fefo(self):
        add_movement(self.db, restaurant_id=RESTO, user_id=USER, movement_type=StockMovementType.OUTPUT,
                     product_id=self.product.id, source_depot_id=self.depot.id, quantity=Decimal("4"))
        self.db.commit()
        lots = {l.lot_number: l.quantity_remaining for l in self.db.query(StockLot).all()}
        self.assertEqual(lots["A"], Decimal("0"))  # périmé le plus tôt -> vidé
        self.assertEqual(lots["B"], Decimal("4"))  # 5 - 1


if __name__ == "__main__":
    unittest.main()
