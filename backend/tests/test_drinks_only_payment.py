"""Commande 100 % boissons bar → paiement immédiat (statut Prête), sans cuisine."""
import unittest

from app.modules.catalog.classification import requires_kitchen_preparation


class DrinksOnlyDetectionTests(unittest.TestCase):
    def test_soft_drinks_skip_kitchen(self):
        self.assertFalse(
            requires_kitchen_preparation("Coca Cola", "Boisson gazeuse", "Boissons", sale_channel="BOISSON")
        )
        self.assertFalse(
            requires_kitchen_preparation("Fanta", sale_channel="BOISSON")
        )
        self.assertFalse(
            requires_kitchen_preparation("Eau gazeuse", "Boissons gazeuses", sale_channel="BOISSON")
        )

    def test_fresh_juice_still_needs_kitchen(self):
        self.assertTrue(
            requires_kitchen_preparation("Jus naturel", "Jus frais pressé", "Boissons", sale_channel="BOISSON")
        )

    def test_food_needs_kitchen(self):
        self.assertTrue(
            requires_kitchen_preparation("Poulet DG", "Plat du jour", "Plats", sale_channel="REPAS")
        )

    def test_explicit_flag_wins(self):
        self.assertFalse(
            requires_kitchen_preparation("Jus maison", sale_channel="BOISSON", explicit=False)
        )
        self.assertTrue(
            requires_kitchen_preparation("Coca", sale_channel="BOISSON", explicit=True)
        )


if __name__ == "__main__":
    unittest.main()
