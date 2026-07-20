"""Rate limiting du module payments (Phase 4.2 — étape 3)."""
from __future__ import annotations

import asyncio
import unittest
from unittest.mock import Mock, patch

from fastapi import HTTPException, Request

from app.rate_limits import API_LIMITS, RateLimitPolicy, apply_rate_limit, payment_rate_limit
from app.ratelimit import InMemoryLimiter


def _mock_request(ip: str = "198.51.100.20") -> Mock:
    request = Mock(spec=Request)
    request.headers = {}
    request.client = Mock(host=ip)
    return request


def _raise_payment_429(*_args, **_kwargs):
    raise HTTPException(
        status_code=429,
        detail="Trop de tentatives. Réessayez dans quelques minutes.",
        headers={"Retry-After": str(API_LIMITS.PAYMENT.window_seconds)},
    )


class PaymentRateLimitPolicyTests(unittest.TestCase):
    def setUp(self):
        self.limiter = InMemoryLimiter()
        self._patcher = patch("app.ratelimit._limiter", self.limiter)
        self._patcher.start()

    def tearDown(self):
        self._patcher.stop()

    def test_under_limit_allows_requests(self):
        policy = RateLimitPolicy(scope="test-payment-ok", limit=3, window_seconds=60)
        request = _mock_request()
        for _ in range(3):
            apply_rate_limit(request, policy)

    def test_over_limit_raises_429_with_retry_after(self):
        policy = RateLimitPolicy(scope="test-payment-429", limit=2, window_seconds=60)
        request = _mock_request()
        apply_rate_limit(request, policy)
        apply_rate_limit(request, policy)
        with self.assertRaises(HTTPException) as ctx:
            apply_rate_limit(request, policy)
        self.assertEqual(ctx.exception.status_code, 429)
        self.assertEqual(ctx.exception.headers.get("Retry-After"), "60")

    def test_payment_policy_constants(self):
        self.assertEqual(API_LIMITS.PAYMENT.scope, "payment")
        self.assertEqual(API_LIMITS.PAYMENT.limit, 20)
        self.assertEqual(API_LIMITS.PAYMENT.window_seconds, 60)
        self.assertTrue(callable(payment_rate_limit))


class PaymentEndpointRateLimitWiringTests(unittest.TestCase):
    def setUp(self):
        self.request = _mock_request()
        self.db = Mock()
        self.user = Mock(restaurant_id="resto-1")

    def _assert_payment_enforce(self, enforce: Mock):
        enforce.assert_called_once_with(
            self.request,
            scope=API_LIMITS.PAYMENT.scope,
            limit=API_LIMITS.PAYMENT.limit,
            window_seconds=API_LIMITS.PAYMENT.window_seconds,
        )

    def test_orange_initiate_returns_429_when_quota_exceeded(self):
        from app.modules.payments.router import initiate_orange_payment
        from app.modules.payments.schemas import OrangePayInitIn

        payload = Mock(spec=OrangePayInitIn)
        with patch("app.rate_limits.enforce_rate_limit", side_effect=_raise_payment_429) as enforce:
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(
                    initiate_orange_payment(
                        payload=payload,
                        request=self.request,
                        current_user=self.user,
                        db=self.db,
                    )
                )
        self.assertEqual(ctx.exception.status_code, 429)
        self.assertEqual(
            ctx.exception.headers.get("Retry-After"),
            str(API_LIMITS.PAYMENT.window_seconds),
        )
        self._assert_payment_enforce(enforce)

    def test_mtn_initiate_returns_429_when_quota_exceeded(self):
        from app.modules.payments.router import initiate_mtn_payment
        from app.modules.payments.schemas import MtnPayInitIn

        payload = Mock(spec=MtnPayInitIn)
        with patch("app.rate_limits.enforce_rate_limit", side_effect=_raise_payment_429) as enforce:
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(
                    initiate_mtn_payment(
                        payload=payload,
                        request=self.request,
                        current_user=self.user,
                        db=self.db,
                    )
                )
        self.assertEqual(ctx.exception.status_code, 429)
        self._assert_payment_enforce(enforce)

    def test_status_returns_429_when_quota_exceeded(self):
        from app.modules.payments.router import get_payment_status

        with patch("app.rate_limits.enforce_rate_limit", side_effect=_raise_payment_429) as enforce:
            with self.assertRaises(HTTPException) as ctx:
                get_payment_status(
                    provider="orange",
                    transaction_id="tx-1",
                    request=self.request,
                    current_user=self.user,
                    db=self.db,
                )
        self.assertEqual(ctx.exception.status_code, 429)
        self._assert_payment_enforce(enforce)

    def test_status_under_limit_reaches_handler(self):
        from app.modules.payments.router import get_payment_status

        with patch("app.rate_limits.enforce_rate_limit") as enforce:
            with patch("app.modules.payments.router.assert_permission"):
                with self.assertRaises(HTTPException) as ctx:
                    get_payment_status(
                        provider="unknown",
                        transaction_id="tx-1",
                        request=self.request,
                        current_user=self.user,
                        db=self.db,
                    )
        enforce.assert_called_once()
        self.assertEqual(ctx.exception.status_code, 404)
        self.assertEqual(ctx.exception.detail, "Opérateur inconnu")

    def test_list_transactions_returns_429_when_quota_exceeded(self):
        from app.modules.payments.router import list_transactions

        with patch("app.rate_limits.enforce_rate_limit", side_effect=_raise_payment_429) as enforce:
            with self.assertRaises(HTTPException) as ctx:
                list_transactions(
                    request=self.request,
                    current_user=self.user,
                    db=self.db,
                )
        self.assertEqual(ctx.exception.status_code, 429)
        self._assert_payment_enforce(enforce)

    def test_create_request_returns_429_when_quota_exceeded(self):
        from app.modules.payments.router import create_payment_request_endpoint
        from app.modules.payments.schemas import PaymentRequestCreateIn

        payload = Mock(spec=PaymentRequestCreateIn)
        with patch("app.rate_limits.enforce_rate_limit", side_effect=_raise_payment_429) as enforce:
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(
                    create_payment_request_endpoint(
                        payload=payload,
                        request=self.request,
                        current_user=self.user,
                        db=self.db,
                    )
                )
        self.assertEqual(ctx.exception.status_code, 429)
        self._assert_payment_enforce(enforce)

    def test_list_requests_returns_429_when_quota_exceeded(self):
        from app.modules.payments.router import list_payment_requests_endpoint

        with patch("app.rate_limits.enforce_rate_limit", side_effect=_raise_payment_429) as enforce:
            with self.assertRaises(HTTPException) as ctx:
                list_payment_requests_endpoint(
                    request=self.request,
                    current_user=self.user,
                    db=self.db,
                )
        self.assertEqual(ctx.exception.status_code, 429)
        self._assert_payment_enforce(enforce)

    def test_validate_request_returns_429_when_quota_exceeded(self):
        from app.modules.payments.router import validate_payment_request_endpoint

        with patch("app.rate_limits.enforce_rate_limit", side_effect=_raise_payment_429) as enforce:
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(
                    validate_payment_request_endpoint(
                        request_id="req-1",
                        request=self.request,
                        current_user=self.user,
                        db=self.db,
                    )
                )
        self.assertEqual(ctx.exception.status_code, 429)
        self._assert_payment_enforce(enforce)

    def test_reject_request_returns_429_when_quota_exceeded(self):
        from app.modules.payments.router import reject_payment_request_endpoint

        with patch("app.rate_limits.enforce_rate_limit", side_effect=_raise_payment_429) as enforce:
            with self.assertRaises(HTTPException) as ctx:
                asyncio.run(
                    reject_payment_request_endpoint(
                        request_id="req-1",
                        request=self.request,
                        current_user=self.user,
                        db=self.db,
                    )
                )
        self.assertEqual(ctx.exception.status_code, 429)
        self._assert_payment_enforce(enforce)

    def test_webhooks_are_not_rate_limited(self):
        """Les webhooks opérateurs restent hors quota (étape dédiée ultérieure)."""
        from app.modules.payments import router as payments_router

        # Les handlers protégés sont wrappés (@wraps) ; les webhooks ne le sont pas.
        self.assertTrue(hasattr(payments_router.initiate_orange_payment, "__wrapped__"))
        self.assertFalse(hasattr(payments_router.orange_webhook, "__wrapped__"))
        self.assertFalse(hasattr(payments_router.mtn_webhook, "__wrapped__"))


if __name__ == "__main__":
    unittest.main()
