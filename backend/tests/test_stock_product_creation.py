import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.modules.audit.models import AuditLog
from app.modules.permissions.models import Role
from app.modules.stock.models import Depot, Product, StockMovement, Unit
from app.modules.stock.router import create_product
from app.modules.stock.schemas import ProductIn
from app.modules.users.models import User


RESTO = "resto-A"


class StockProductCreationTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(
            self.engine,
            tables=[
                Product.__table__,
                StockMovement.__table__,
                Depot.__table__,
                Unit.__table__,
                User.__table__,
                AuditLog.__table__,
            ],
        )
        self.db = sessionmaker(bind=self.engine)()
        self.unit = Unit(id="unit-kg", restaurant_id=RESTO, name="kg", symbol="kg")
        self.user = User(
            id="user-stock",
            restaurant_id=RESTO,
            username="stock",
            password_hash="x",
            first_name="Stock",
            last_name="User",
            role=Role.STOCK,
        )
        self.db.add_all([self.unit, self.user])
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_create_product_from_minimal_stock_form_payload(self):
        result = create_product(
            ProductIn(
                code="P1",
                name="POULET",
                unit_id=self.unit.id,
                minimum_stock=10,
                product_type="INGREDIENT",
            ),
            current_user=self.user,
            db=self.db,
        )

        self.assertEqual(result["code"], "P1")
        self.assertEqual(result["name"], "POULET")
        self.assertEqual(result["unit_id"], self.unit.id)
        self.assertEqual(float(result["minimum_stock"]), 10)
        self.assertEqual(float(result["purchase_price"]), 0)


if __name__ == "__main__":
    unittest.main()
