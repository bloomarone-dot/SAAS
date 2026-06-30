import unittest

from app.modules.restaurants.tenant_resolution import clean_host, extract_subdomain, normalize_subdomain


class PublicTenantResolutionTests(unittest.TestCase):
    def test_clean_host_removes_port_and_normalizes_case(self):
        self.assertEqual(clean_host("LeBonCoin.BloomarOne.Com:5177"), "leboncoin.bloomarone.com")

    def test_extract_subdomain_from_base_domain(self):
        self.assertEqual(extract_subdomain("leboncoin.bloomarone.com"), "leboncoin")
        self.assertEqual(extract_subdomain("pouletmayo.bloomarone.com"), "pouletmayo")

    def test_extract_subdomain_rejects_platform_and_nested_hosts(self):
        self.assertIsNone(extract_subdomain("bloomarone.com"))
        self.assertIsNone(extract_subdomain("demo.leboncoin.bloomarone.com"))
        self.assertIsNone(extract_subdomain("example.com"))

    def test_normalize_subdomain_keeps_dns_safe_value(self):
        self.assertEqual(normalize_subdomain("Le Bon Coin"), "leboncoin")
        self.assertEqual(normalize_subdomain("Poulet Mayo"), "pouletmayo")


if __name__ == "__main__":
    unittest.main()
