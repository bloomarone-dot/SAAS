"""Rate limiting des endpoints publics (Phase 4.2 — étape 2)."""
from __future__ import annotations

import unittest
from unittest.mock import Mock, patch

from fastapi import HTTPException, Request

from app.rate_limits import (
    API_LIMITS,
    RateLimitPolicy,
    apply_rate_limit,
    auth_rate_limit,
    public_menu_rate_limit,
    public_order_rate_limit,
    rate_limit,
)
from app.ratelimit import InMemoryLimiter


def _mock_request(ip: str = "203.0.113.10") -> Mock:
    request = Mock(spec=Request)
    request.headers = {}
    request.client = Mock(host=ip)
    return request


class RateLimitHelperTests(unittest.TestCase):
    def setUp(self):
        self.limiter = InMemoryLimiter()
        self._patcher = patch("app.ratelimit._limiter", self.limiter)
        self._patcher.start()

    def tearDown(self):
        self._patcher.stop()

    def test_under_limit_allows_requests(self):
        policy = RateLimitPolicy(scope="test-public-ok", limit=3, window_seconds=60)
        request = _mock_request()
        for _ in range(3):
            apply_rate_limit(request, policy)

    def test_over_limit_raises_429_with_retry_after(self):
        policy = RateLimitPolicy(scope="test-public-429", limit=2, window_seconds=90)
        request = _mock_request()
        apply_rate_limit(request, policy)
        apply_rate_limit(request, policy)
        with self.assertRaises(HTTPException) as ctx:
            apply_rate_limit(request, policy)
        self.assertEqual(ctx.exception.status_code, 429)
        self.assertEqual(ctx.exception.headers.get("Retry-After"), "90")

    def test_decorator_enforces_policy(self):
        policy = RateLimitPolicy(scope="test-decorator", limit=1, window_seconds=45)

        @rate_limit(policy)
        def endpoint(request: Request):
            return "ok"

        request = _mock_request()
        self.assertEqual(endpoint(request=request), "ok")
        with self.assertRaises(HTTPException) as ctx:
            endpoint(request=request)
        self.assertEqual(ctx.exception.status_code, 429)
        self.assertEqual(ctx.exception.headers.get("Retry-After"), "45")


class PublicEndpointRateLimitWiringTests(unittest.TestCase):
    """Vérifie que les décorateurs sont bien branchés sur les handlers publics."""

    def setUp(self):
        self.request = _mock_request()
        self.db = Mock()

    def test_public_menu_returns_429_when_quota_exceeded(self):
        from app.modules.menu.routes import get_public_menu

        with patch("app.rate_limits.enforce_rate_limit") as enforce:
            enforce.side_effect = HTTPException(
                status_code=429,
                detail="Trop de tentatives. Réessayez dans quelques minutes.",
                headers={"Retry-After": str(API_LIMITS.PUBLIC_MENU.window_seconds)},
            )
            with self.assertRaises(HTTPException) as ctx:
                get_public_menu(slug="demo", request=self.request, db=self.db)
        self.assertEqual(ctx.exception.status_code, 429)
        self.assertEqual(
            ctx.exception.headers.get("Retry-After"),
            str(API_LIMITS.PUBLIC_MENU.window_seconds),
        )
        enforce.assert_called_once_with(
            self.request,
            scope=API_LIMITS.PUBLIC_MENU.scope,
            limit=API_LIMITS.PUBLIC_MENU.limit,
            window_seconds=API_LIMITS.PUBLIC_MENU.window_seconds,
        )

    def test_public_order_returns_429_when_quota_exceeded(self):
        from app.modules.orders.router import create_public_order
        from app.modules.orders.schemas import PublicOrderCreateIn

        payload = Mock(spec=PublicOrderCreateIn)
        with patch("app.rate_limits.enforce_rate_limit") as enforce:
            enforce.side_effect = HTTPException(
                status_code=429,
                detail="Trop de tentatives. Réessayez dans quelques minutes.",
                headers={"Retry-After": str(API_LIMITS.PUBLIC_ORDER.window_seconds)},
            )
            with self.assertRaises(HTTPException) as ctx:
                create_public_order(slug="demo", payload=payload, request=self.request, db=self.db)
        self.assertEqual(ctx.exception.status_code, 429)
        self.assertEqual(
            ctx.exception.headers.get("Retry-After"),
            str(API_LIMITS.PUBLIC_ORDER.window_seconds),
        )
        enforce.assert_called_once_with(
            self.request,
            scope=API_LIMITS.PUBLIC_ORDER.scope,
            limit=API_LIMITS.PUBLIC_ORDER.limit,
            window_seconds=API_LIMITS.PUBLIC_ORDER.window_seconds,
        )

    def test_instance_request_returns_429_when_quota_exceeded(self):
        from app.modules.platform.router import create_instance_request
        from app.modules.platform.schemas import InstanceRequestCreateIn

        payload = Mock(spec=InstanceRequestCreateIn)
        with patch("app.rate_limits.enforce_rate_limit") as enforce:
            enforce.side_effect = HTTPException(
                status_code=429,
                detail="Trop de tentatives. Réessayez dans quelques minutes.",
                headers={"Retry-After": str(API_LIMITS.AUTH.window_seconds)},
            )
            with self.assertRaises(HTTPException) as ctx:
                create_instance_request(payload=payload, request=self.request, db=self.db)
        self.assertEqual(ctx.exception.status_code, 429)
        self.assertEqual(
            ctx.exception.headers.get("Retry-After"),
            str(API_LIMITS.AUTH.window_seconds),
        )
        enforce.assert_called_once_with(
            self.request,
            scope=API_LIMITS.AUTH.scope,
            limit=API_LIMITS.AUTH.limit,
            window_seconds=API_LIMITS.AUTH.window_seconds,
        )

    def test_public_menu_under_limit_reaches_handler(self):
        from app.modules.menu.routes import get_public_menu

        empty_query = Mock()
        empty_query.filter.return_value.one_or_none.return_value = None
        self.db.query.return_value = empty_query

        with patch("app.rate_limits.enforce_rate_limit") as enforce:
            with self.assertRaises(HTTPException) as ctx:
                get_public_menu(slug="missing", request=self.request, db=self.db)
        enforce.assert_called_once()
        self.assertEqual(ctx.exception.status_code, 404)

    def test_decorators_are_aliases_of_central_policies(self):
        self.assertEqual(API_LIMITS.PUBLIC_MENU.scope, "public-menu")
        self.assertEqual(API_LIMITS.PUBLIC_ORDER.scope, "public-order")
        self.assertEqual(API_LIMITS.AUTH.scope, "auth")
        self.assertTrue(callable(public_menu_rate_limit))
        self.assertTrue(callable(public_order_rate_limit))
        self.assertTrue(callable(auth_rate_limit))


if __name__ == "__main__":
    unittest.main()
