"""Orange Money CM : champs camelCase + URL de notification obligatoire."""
import unittest

from app.modules.payments.orange_service import (
    OrangePaymentError,
    normalize_cm_msisdn,
    parse_orange_status,
    require_public_notify_url,
)


class OrangeMoneyPayloadTests(unittest.TestCase):
    def test_normalize_msisdn(self):
        self.assertEqual(normalize_cm_msisdn("657957087"), "657957087")
        self.assertEqual(normalize_cm_msisdn("0657957087"), "657957087")
        self.assertEqual(normalize_cm_msisdn("+237657957087"), "657957087")
        self.assertEqual(normalize_cm_msisdn("237 657 957 087"), "657957087")

    def test_require_public_notify_url(self):
        url = require_public_notify_url("https://restaurant.bloomarone.com/api/v1/payments/orange/webhook")
        self.assertTrue(url.startswith("https://"))

    def test_reject_empty_or_localhost_notify_url(self):
        with self.assertRaises(OrangePaymentError):
            require_public_notify_url("")
        with self.assertRaises(OrangePaymentError):
            require_public_notify_url("http://localhost:8000/api/v1/payments/orange/webhook")
        with self.assertRaises(OrangePaymentError):
            require_public_notify_url("not-a-url")

    def test_parse_status_nested_data(self):
        self.assertEqual(
            parse_orange_status({"message": "ok", "data": {"status": "PENDING"}}),
            "PENDING",
        )
        self.assertEqual(
            parse_orange_status({"data": {"status": "SUCCESSFULL"}}),
            "SUCCESS",
        )


if __name__ == "__main__":
    unittest.main()
