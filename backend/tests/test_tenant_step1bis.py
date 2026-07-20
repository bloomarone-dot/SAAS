"""Tests d'isolation tenant pour paiements et tenant_find."""
import unittest

from sqlalchemy import Column, String, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.tenancy import tenant_find

Base = declarative_base()


class Category(Base):
    __tablename__ = "menu_categories"
    id = Column(String(36), primary_key=True)
    restaurant_id = Column(String(36), nullable=False)
    name = Column(String(160), nullable=False)


class Order(Base):
    __tablename__ = "customer_orders"
    id = Column(String(36), primary_key=True)
    restaurant_id = Column(String(36), nullable=False)
    status = Column(String(40), nullable=False, default="Nouvelle")


class Transaction(Base):
    __tablename__ = "payment_transactions"
    id = Column(String(36), primary_key=True)
    restaurant_id = Column(String(36), nullable=False)
    order_id = Column(String(36), nullable=True)


RESTO_A = "resto-A"
RESTO_B = "resto-B"


class TenantFindTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.db.add_all(
            [
                Category(id="cat-a", restaurant_id=RESTO_A, name="Entrees"),
                Category(id="cat-b", restaurant_id=RESTO_B, name="Boissons"),
            ]
        )
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_tenant_find_in_step1bis(self):
        self.assertIsNotNone(tenant_find(self.db, Category, "cat-a", RESTO_A))

    def test_tenant_find_cross_tenant_returns_none(self):
        self.assertIsNone(tenant_find(self.db, Category, "cat-b", RESTO_A))


class PaymentOrderLoadTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.db.add_all(
            [
                Order(id="order-a", restaurant_id=RESTO_A, status="Livrée"),
                Order(id="order-b", restaurant_id=RESTO_B, status="Livrée"),
                Transaction(id="tx-1", restaurant_id=RESTO_A, order_id="order-a"),
                Transaction(id="tx-2", restaurant_id=RESTO_A, order_id="order-b"),
            ]
        )
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def _load_order(self, tx: Transaction) -> Order | None:
        if not tx.order_id or not tx.restaurant_id:
            return None
        return (
            self.db.query(Order)
            .filter(Order.id == tx.order_id, Order.restaurant_id == tx.restaurant_id)
            .one_or_none()
        )

    def test_load_transaction_order_same_tenant(self):
        tx = self.db.get(Transaction, "tx-1")
        order = self._load_order(tx)
        self.assertEqual(order.id, "order-a")

    def test_load_transaction_order_cross_tenant_order_rejected(self):
        tx = self.db.get(Transaction, "tx-2")
        order = self._load_order(tx)
        self.assertIsNone(order)


if __name__ == "__main__":
    unittest.main()
