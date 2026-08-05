"""Classification repas / boisson du catalogue."""
import unittest

from app.modules.catalog.classification import classify_sale_channel


class SaleChannelClassificationTests(unittest.TestCase):
    def test_meal_category_overrides_drink_keyword_in_name(self):
        self.assertEqual(
            classify_sale_channel("Poulet", None, "Plats", None),
            "REPAS",
        )

    def test_drink_category_is_boisson(self):
        self.assertEqual(
            classify_sale_channel("Coca Cola", "Gazeuse", "Boissons", None),
            "BOISSON",
        )

    def test_ambiguous_name_without_category_defaults_to_repas(self):
        self.assertEqual(
            classify_sale_channel("Poulet DG", "Plat du jour", "Specialites", None),
            "REPAS",
        )


if __name__ == "__main__":
    unittest.main()
