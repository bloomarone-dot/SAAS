"""Import Excel/CSV stock — parsing et règles métier de base."""
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock

import app.modules.models  # noqa: F401 — enregistre Branch avant Restaurant

from app.modules.stock.import_excel import (
    ImportRow,
    build_template_csv,
    build_template_xlsx,
    parse_csv_bytes,
    parse_import_file,
    parse_xlsx_bytes,
    rows_from_dicts,
)
from app.modules.stock.models import DepotType, Product, StockProductType, Unit
from app.modules.stock.router import _import_product_row, ensure_depot_by_label, ensure_unit_by_label


class ParseImportTests(unittest.TestCase):
    def test_template_csv_parses(self):
        rows = parse_csv_bytes(build_template_csv())
        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[0].nom, "Riz parfumé")
        self.assertEqual(rows[0].quantite, 50.0)
        self.assertIsNone(rows[2].quantite)

    def test_template_xlsx_parses(self):
        rows = parse_xlsx_bytes(build_template_xlsx())
        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[1].unite, "L")

    def test_header_aliases(self):
        rows = rows_from_dicts(
            [
                {
                    "Code": "A1",
                    "Désignation": "Tomate",
                    "Unité": "kg",
                    "Quantité": "12",
                    "Magasin": "Cuisine",
                    "Prix": "800",
                }
            ]
        )
        self.assertEqual(rows[0].code, "A1")
        self.assertEqual(rows[0].nom, "Tomate")
        self.assertEqual(rows[0].depot, "Cuisine")
        self.assertEqual(rows[0].prix_achat, 800.0)

    def test_quantity_requires_depot(self):
        with self.assertRaises(ValueError) as ctx:
            rows_from_dicts([{"nom": "Sel", "unite": "kg", "quantite": "5"}])
        self.assertIn("dépôt", str(ctx.exception).lower())

    def test_parse_import_file_detects_xlsx(self):
        content = build_template_xlsx()
        rows = parse_import_file("stock.xlsx", content)
        self.assertGreaterEqual(len(rows), 2)


class FakeQuery:
    def __init__(self, items=None):
        self.items = list(items or [])

    def filter(self, *args, **kwargs):
        return self

    def all(self):
        return self.items

    def first(self):
        return self.items[0] if self.items else None

    def one_or_none(self):
        return self.items[0] if self.items else None

    def order_by(self, *args, **kwargs):
        return self


class FakeDB:
    def __init__(self):
        self.added = []
        self._units = []
        self._depots = []
        self._products = []

    def add(self, obj):
        self.added.append(obj)
        cls_name = obj.__class__.__name__
        if cls_name == "Unit":
            if not getattr(obj, "id", None):
                obj.id = f"unit-{len(self._units) + 1}"
            self._units.append(obj)
        elif cls_name == "Depot":
            if not getattr(obj, "id", None):
                obj.id = f"depot-{len(self._depots) + 1}"
            self._depots.append(obj)
        elif cls_name == "Product":
            if not getattr(obj, "id", None):
                obj.id = f"prod-{len(self._products) + 1}"
            self._products.append(obj)

    def flush(self):
        return None

    def query(self, model):
        name = getattr(model, "__name__", str(model))
        if name == "Unit":
            return FakeQuery(self._units)
        if name == "Depot":
            return FakeQuery(self._depots)
        if name == "Product":
            return FakeQuery(self._products)
        return FakeQuery([])


class ImportHelpersTests(unittest.TestCase):
    def test_ensure_unit_creates_when_missing(self):
        db = FakeDB()
        unit = ensure_unit_by_label(db, "rest-1", "sac")
        self.assertEqual(unit.name, "sac")
        self.assertEqual(len(db._units), 1)
        again = ensure_unit_by_label(db, "rest-1", "sac")
        self.assertIs(again, unit)

    def test_ensure_depot_creates_when_missing(self):
        db = FakeDB()
        depot = ensure_depot_by_label(db, "rest-1", "Cave")
        self.assertEqual(depot.name, "Cave")
        self.assertEqual(depot.type, DepotType.AUTRE)
        again = ensure_depot_by_label(db, "rest-1", "Cave")
        self.assertIs(again, depot)


class ImportRowLogicTests(unittest.TestCase):
    def test_create_product_without_quantity(self):
        db = FakeDB()
        user = SimpleNamespace(id="u1", restaurant_id="rest-1")
        row = ImportRow(
            line_number=2,
            code="X1",
            nom="Poivre",
            unite="kg",
            seuil_min=2,
            depot=None,
            quantite=None,
            prix_achat=None,
        )
        import app.modules.stock.router as stock_router

        original = stock_router.add_movement
        stock_router.add_movement = MagicMock()
        try:
            result = _import_product_row(db, user, row)
            self.assertEqual(result["created"], 1)
            self.assertEqual(result["entries"], 0)
            self.assertEqual(db._products[0].name, "Poivre")
            self.assertEqual(db._products[0].product_type, StockProductType.INGREDIENT)
            stock_router.add_movement.assert_not_called()
        finally:
            stock_router.add_movement = original

    def test_update_existing_and_add_entry(self):
        db = FakeDB()
        unit = Unit(restaurant_id="rest-1", name="kg", symbol="kg")
        unit.id = "unit-1"
        db._units.append(unit)
        product = Product(
            restaurant_id="rest-1",
            code="X1",
            name="Poivre",
            unit_id="unit-1",
            purchase_price=0,
            minimum_stock=1,
        )
        product.id = "prod-1"
        db._products.append(product)

        user = SimpleNamespace(id="u1", restaurant_id="rest-1")
        row = ImportRow(
            line_number=3,
            code="X1",
            nom="Poivre",
            unite="kg",
            seuil_min=8,
            depot="Principal",
            quantite=15,
            prix_achat=500,
        )
        import app.modules.stock.router as stock_router

        original = stock_router.add_movement
        stock_router.add_movement = MagicMock()
        try:
            result = _import_product_row(db, user, row)
            self.assertEqual(result["updated"], 1)
            self.assertEqual(result["entries"], 1)
            self.assertEqual(product.minimum_stock, 8)
            stock_router.add_movement.assert_called_once()
        finally:
            stock_router.add_movement = original


if __name__ == "__main__":
    unittest.main()
