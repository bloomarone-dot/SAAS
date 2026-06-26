"""P0-1c : déstockage recette en Decimal (consommation + correction négative).

Couvre notamment le chemin de correction (delta <= 0) qui mélangeait Decimal et
float (TypeError) avant la conversion.
"""
import unittest
from datetime import datetime
from decimal import Decimal
from types import SimpleNamespace

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
import app.modules.models  # noqa: F401
from app.modules.permissions.models import Role
from app.modules.stock.models import (
    Depot,
    DepotType,
    Product,
    StockLocation,
    StockMovement,
    StockMovementType,
    StockRecipeIngredient,
)
from app.modules.users.models import User
from app.modules.stock.router import add_movement, get_current_stock
from app.modules.orders.router import adjust_recipe_stock
from tests._schema import STOCK_WITH_ACCOUNTING

RESTO = "resto-A"
USER = "user-1"


class OrdersRecipeDecimalTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Base.metadata.create_all(self.engine, tables=STOCK_WITH_ACCOUNTING)
        self.db = sessionmaker(bind=self.engine)()
        # get_item_or_404 calcule le stock pour MAGASIN/CUISINE/BOISSON -> 3 dépôts requis.
        self.db.add_all([
            Depot(restaurant_id=RESTO, name="Magasin", code="MAIN", type=DepotType.PRINCIPAL, is_active=True),
            Depot(restaurant_id=RESTO, name="Cuisine", code="KITCHEN", type=DepotType.CUISINE, is_active=True),
            Depot(restaurant_id=RESTO, name="Boisson", code="DRINK", type=DepotType.BOISSON, is_active=True),
        ])
        # consume_fifo -> default_user_id() lit la table users (created_by_id=None).
        self.db.add(User(
            id=USER, username="resto-user", first_name="Resto", last_name="User",
            password_hash="x", role=Role.ADMIN, restaurant_id=RESTO,
            is_owner=True, is_active=True, created_at=datetime.utcnow(),
        ))
        self.kitchen = self.db.query(Depot).filter(Depot.code == "KITCHEN").one()
        self.ingredient = Product(restaurant_id=RESTO, name="Tomate", unit_id="u1", purchase_price=Decimal("80.00"))
        self.db.add(self.ingredient)
        self.db.commit()
        # Stock initial cuisine = 10
        add_movement(self.db, restaurant_id=RESTO, user_id=USER, movement_type=StockMovementType.ENTRY,
                     product_id=self.ingredient.id, destination_depot_id=self.kitchen.id, quantity=Decimal("10"))
        self.db.add(StockRecipeIngredient(
            restaurant_id=RESTO, menu_item_id="dish-1", stock_item_id=self.ingredient.id,
            quantity_per_dish=Decimal("2"), location=StockLocation.CUISINE,
        ))
        self.db.commit()
        self.dish = SimpleNamespace(id="dish-1", name="Salade")

    def tearDown(self):
        self.db.close()

    def _kitchen_stock(self):
        return get_current_stock(self.db, self.ingredient.id, self.kitchen.id, RESTO)

    def test_positive_delta_consumes_recipe_stock(self):
        adjust_recipe_stock(self.db, RESTO, self.dish, 3)  # 3 plats x 2 = 6 consommés
        self.db.commit()
        self.assertEqual(self._kitchen_stock(), Decimal("4"))

    def test_negative_delta_correction_does_not_raise(self):
        adjust_recipe_stock(self.db, RESTO, self.dish, 3)
        self.db.commit()
        # Chemin correction (delta négatif) : ne doit PAS lever de TypeError Decimal/float.
        adjust_recipe_stock(self.db, RESTO, self.dish, -3)
        self.db.commit()
        adjustment = (
            self.db.query(StockMovement)
            .filter(StockMovement.movement_type == StockMovementType.ADJUSTMENT)
            .one()
        )
        # Le kwarg legacy `value=` est routé vers total_amount par StockMovement.__init__.
        self.assertIsInstance(adjustment.total_amount, Decimal)
        self.assertEqual(adjustment.total_amount, Decimal("480.00"))  # 6 x 80,00
        self.assertEqual(adjustment.quantity, Decimal("6"))

    def test_insufficient_recipe_stock_is_blocked(self):
        from fastapi import HTTPException
        with self.assertRaises(HTTPException):
            adjust_recipe_stock(self.db, RESTO, self.dish, 100)  # 200 > 10 dispo


if __name__ == "__main__":
    unittest.main()
