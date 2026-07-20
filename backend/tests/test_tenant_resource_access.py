"""Tests d'isolation tenant sur les helpers metier (stock)."""
import unittest

from fastapi import HTTPException
from sqlalchemy import Column, String, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.tenancy import tenant_get_or_404

Base = declarative_base()


class Product(Base):
    __tablename__ = "products"
    id = Column(String(36), primary_key=True)
    restaurant_id = Column(String(36), nullable=False)
    name = Column(String(160), nullable=False)


RESTO_A = "resto-A"
RESTO_B = "resto-B"


class TenantResourceAccessTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.db.add_all(
            [
                Product(id="prod-a", restaurant_id=RESTO_A, name="Produit A"),
                Product(id="prod-b", restaurant_id=RESTO_B, name="Produit B"),
            ]
        )
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_tenant_get_product_same_tenant(self):
        product = tenant_get_or_404(self.db, Product, "prod-a", RESTO_A, detail="Produit stock introuvable")
        self.assertEqual(product.name, "Produit A")

    def test_tenant_get_product_cross_tenant_is_404(self):
        with self.assertRaises(HTTPException) as ctx:
            tenant_get_or_404(self.db, Product, "prod-b", RESTO_A, detail="Produit stock introuvable")
        self.assertEqual(ctx.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
