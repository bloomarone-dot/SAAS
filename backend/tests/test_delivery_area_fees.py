"""Frais de livraison par quartier (pas un montant unique partout)."""
import unittest

from app.modules.branches.yaounde_quartiers import fee_for_quartier


class DeliveryAreaFeeTests(unittest.TestCase):
    def test_near_zone_is_500(self):
        self.assertEqual(fee_for_quartier("Bastos"), 500)
        self.assertEqual(fee_for_quartier("Centre-ville"), 500)

    def test_mid_zone_is_1000(self):
        self.assertEqual(fee_for_quartier("Biyem-Assi"), 1000)
        self.assertEqual(fee_for_quartier("Obili"), 1000)

    def test_far_zone_is_1500(self):
        self.assertEqual(fee_for_quartier("Odza"), 1500)
        self.assertEqual(fee_for_quartier("Simbock"), 1500)

    def test_periphery_is_2000(self):
        self.assertEqual(fee_for_quartier("Olembe"), 2000)
        self.assertEqual(fee_for_quartier("Nkolbisson"), 1500)

    def test_case_insensitive(self):
        self.assertEqual(fee_for_quartier("bastos"), 500)
        self.assertEqual(fee_for_quartier("  BASTOS  "), 500)

    def test_unknown_uses_fallback(self):
        self.assertEqual(fee_for_quartier("Quartier Inconnu", 1234), 1234)


if __name__ == "__main__":
    unittest.main()
