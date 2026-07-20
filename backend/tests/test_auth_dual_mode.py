"""Tests du mode dual Bearer + cookies HttpOnly."""
import os
import unittest
from unittest.mock import Mock, patch

import app.modules.models  # noqa: F401
from fastapi import Response
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.modules.auth.auth_resolution import ACCESS_TOKEN_COOKIE_NAME, authenticate_user_from_access_token, resolve_access_token
from app.modules.auth.cookies import (
    REFRESH_TOKEN_COOKIE_PATH,
    REFRESH_TOKEN_MAX_AGE_SECONDS,
    clear_refresh_token_cookie,
    set_refresh_token_cookie,
)
from app.modules.auth.models import RefreshToken
from app.modules.auth.refresh_tokens import verify_refresh_token
from app.modules.auth.router import _finalize_login, logout, logout_all, refresh_session
from app.modules.auth.schemas import RefreshTokenIn
from app.modules.auth.token_service import REFRESH_TOKEN_COOKIE_NAME, issue_token_pair, rotate_refresh_token
from app.modules.permissions.models import Role
from app.modules.restaurants.models import Restaurant
from app.modules.users.models import User, UserPermission
from app.security import create_access_token, hash_password


def _make_user(user_id: str = "user-1") -> User:
    return User(
        id=user_id,
        username=f"user_{user_id}",
        password_hash=hash_password("TestPass123!"),
        first_name="Test",
        last_name="User",
        role=Role.CAISSE,
        restaurant_id="resto-1",
        token_version=0,
    )


def _mock_request(*, refresh_cookie: str | None = None, access_cookie: str | None = None) -> Mock:
    request = Mock()
    cookies = {}
    if refresh_cookie:
        cookies[REFRESH_TOKEN_COOKIE_NAME] = refresh_cookie
    if access_cookie:
        cookies[ACCESS_TOKEN_COOKIE_NAME] = access_cookie
    request.cookies = cookies
    request.headers = {"user-agent": "pytest"}
    request.client = Mock(host="127.0.0.1")
    return request


class DualModeCookieTests(unittest.TestCase):
    @patch("app.modules.auth.cookies.auth_uses_refresh_cookies", return_value=True)
    @patch("app.modules.auth.cookies.COOKIE_SECURE", True)
    @patch("app.modules.auth.cookies.COOKIE_SAMESITE", "strict")
    @patch("app.modules.auth.cookies.COOKIE_DOMAIN", ".example.com")
    def test_set_refresh_cookie_configuration(self, _dual):
        response = Response()
        set_refresh_token_cookie(response, "0.secret-token")
        header = response.headers.get("set-cookie", "")
        self.assertIn(f"{REFRESH_TOKEN_COOKIE_NAME}=0.secret-token", header)
        self.assertIn("HttpOnly", header)
        self.assertIn("Secure", header)
        self.assertIn("SameSite=strict", header)
        self.assertIn(f"Domain=.example.com", header)
        self.assertIn(f"Path={REFRESH_TOKEN_COOKIE_PATH}", header)
        self.assertIn(f"Max-Age={REFRESH_TOKEN_MAX_AGE_SECONDS}", header)

    @patch("app.modules.auth.cookies.auth_uses_refresh_cookies", return_value=True)
    def test_clear_refresh_cookie_max_age_zero(self, _dual):
        response = Response()
        clear_refresh_token_cookie(response)
        header = response.headers.get("set-cookie", "")
        self.assertIn(f"{REFRESH_TOKEN_COOKIE_NAME}=", header)
        self.assertIn("Max-Age=0", header)


class DualModeLoginTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Restaurant.__table__.create(self.engine)
        User.__table__.create(self.engine)
        UserPermission.__table__.create(self.engine)
        RefreshToken.__table__.create(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()
        self.db.add(Restaurant(id="resto-1", name="Test Resto", slug="test-resto", is_active=True))
        self.user = _make_user()
        self.db.add(self.user)
        self.db.commit()

    def tearDown(self):
        self.db.close()

    @patch("app.modules.auth.router.auth_uses_refresh_cookies", return_value=False)
    def test_bearer_mode_login_no_refresh_row(self, _dual):
        response = Response()
        result = _finalize_login(db=self.db, user=self.user, request=_mock_request(), response=response)
        self.assertTrue(result.access_token)
        self.assertEqual(result.token_type, "bearer")
        self.assertIsNone(response.headers.get("set-cookie"))
        count = self.db.query(RefreshToken).count()
        self.assertEqual(count, 0)

    @patch("app.modules.auth.router.auth_uses_refresh_cookies", return_value=True)
    @patch("app.modules.auth.cookies.auth_uses_refresh_cookies", return_value=True)
    def test_dual_mode_login_sets_cookie_and_persists_refresh(self, _cookies_dual, _router_dual):
        response = Response()
        result = _finalize_login(db=self.db, user=self.user, request=_mock_request(), response=response)
        header = response.headers.get("set-cookie", "")
        self.assertIn(REFRESH_TOKEN_COOKIE_NAME, header)
        self.assertIn("HttpOnly", header)
        self.assertNotIn("refresh_token", result.model_dump())  # refresh absent du JSON login
        self.assertEqual(self.db.query(RefreshToken).count(), 1)


class DualModeRefreshLogoutTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Restaurant.__table__.create(self.engine)
        User.__table__.create(self.engine)
        UserPermission.__table__.create(self.engine)
        RefreshToken.__table__.create(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()
        self.db.add(Restaurant(id="resto-1", name="Test Resto", slug="test-resto", is_active=True))
        self.user = _make_user()
        self.db.add(self.user)
        self.db.commit()

    def tearDown(self):
        self.db.close()

    @patch("app.modules.auth.router.enforce_rate_limit")
    @patch("app.modules.auth.cookies.auth_uses_refresh_cookies", return_value=True)
    def test_refresh_via_cookie_only(self, _dual, _rate):
        pair = issue_token_pair(self.db, self.user)
        self.db.commit()
        response = Response()
        result = refresh_session(
            RefreshTokenIn(refresh_token=None),
            _mock_request(refresh_cookie=pair.refresh_token),
            response,
            self.db,
        )
        self.db.commit()
        self.assertTrue(result.access_token)
        self.assertIn(REFRESH_TOKEN_COOKIE_NAME, response.headers.get("set-cookie", ""))

    @patch("app.modules.auth.router.enforce_rate_limit")
    @patch("app.modules.auth.cookies.auth_uses_refresh_cookies", return_value=True)
    def test_logout_clears_cookie(self, _dual, _rate):
        pair = issue_token_pair(self.db, self.user)
        self.db.commit()
        response = Response()
        logout(RefreshTokenIn(refresh_token=pair.refresh_token), _mock_request(), response, self.db)
        self.db.commit()
        self.assertIn("Max-Age=0", response.headers.get("set-cookie", ""))

    @patch("app.modules.auth.router.log_action")
    @patch("app.modules.auth.cookies.auth_uses_refresh_cookies", return_value=True)
    def test_logout_all_clears_cookie(self, _dual, _log):
        response = Response()
        logout_all(response=response, current_user=self.user, db=self.db)
        self.db.commit()
        self.assertIn("Max-Age=0", response.headers.get("set-cookie", ""))


class AuthResolutionTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Restaurant.__table__.create(self.engine)
        User.__table__.create(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()
        self.db.add(Restaurant(id="resto-1", name="Test Resto", slug="test-resto", is_active=True))
        self.user = _make_user()
        self.db.add(self.user)
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_bearer_has_priority_over_cookie(self):
        bearer = create_access_token(self.user.id, 0)
        access_cookie = create_access_token("other-user", 0)
        request = _mock_request(access_cookie=access_cookie)
        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=bearer)
        with patch("app.modules.auth.auth_resolution.AUTH_MODE", "dual"):
            token = resolve_access_token(request, credentials)
        self.assertEqual(token, bearer)

    @patch("app.modules.auth.auth_resolution.AUTH_MODE", "dual")
    def test_access_cookie_used_when_no_bearer(self):
        token = create_access_token(self.user.id, 0)
        request = _mock_request(access_cookie=token)
        resolved = resolve_access_token(request, None)
        self.assertEqual(resolved, token)
        user = authenticate_user_from_access_token(self.db, resolved)
        self.assertEqual(user.id, self.user.id)

    @patch("app.modules.auth.auth_resolution.AUTH_MODE", "bearer")
    def test_access_cookie_ignored_in_bearer_mode(self):
        token = create_access_token(self.user.id, 0)
        request = _mock_request(access_cookie=token)
        self.assertIsNone(resolve_access_token(request, None))


class RotateAtomicityTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Restaurant.__table__.create(self.engine)
        User.__table__.create(self.engine)
        RefreshToken.__table__.create(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()
        self.db.add(Restaurant(id="resto-1", name="Test Resto", slug="test-resto", is_active=True))
        self.user = _make_user()
        self.db.add(self.user)
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_rotate_rolls_back_if_issue_fails(self):
        pair = issue_token_pair(self.db, self.user)
        self.db.commit()
        with patch("app.modules.auth.token_service.issue_token_pair", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                rotate_refresh_token(self.db, pair.refresh_token)
        self.db.rollback()
        self.assertIsNotNone(verify_refresh_token(self.db, pair.refresh_token, touch_last_used=False))


if __name__ == "__main__":
    unittest.main()
