"""Tests des endpoints refresh / logout et du service token."""
import unittest
from datetime import timedelta
from unittest.mock import Mock, patch

import app.modules.models  # noqa: F401
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.modules.auth.models import RefreshToken
from app.modules.auth.refresh_tokens import generate_refresh_token, hash_refresh_token, verify_refresh_token
from app.modules.auth.router import logout, logout_all, refresh_session
from app.modules.auth.schemas import RefreshTokenIn
from app.modules.auth.token_service import (
    REFRESH_TOKEN_COOKIE_NAME,
    issue_token_pair,
    logout_all_sessions,
    rotate_refresh_token,
)
from app.modules.permissions.models import Role
from app.modules.restaurants.models import Restaurant
from app.modules.shared.models import utcnow
from app.modules.users.models import User, UserPermission
from app.security import create_access_token, decode_access_token, hash_password


def _make_user(user_id: str = "user-1", token_version: int = 0, is_active: bool = True) -> User:
    return User(
        id=user_id,
        username=f"user_{user_id}",
        password_hash=hash_password("TestPass123!"),
        first_name="Test",
        last_name="User",
        role=Role.CAISSE,
        restaurant_id="resto-1",
        token_version=token_version,
        is_active=is_active,
    )


def _mock_request(refresh_cookie: str | None = None) -> Mock:
    request = Mock()
    request.cookies = {REFRESH_TOKEN_COOKIE_NAME: refresh_cookie} if refresh_cookie else {}
    request.headers = {"user-agent": "pytest"}
    request.client = Mock(host="127.0.0.1")
    return request


class AuthTokenServiceTests(unittest.TestCase):
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

    def test_issue_token_pair_returns_access_and_refresh(self):
        pair = issue_token_pair(self.db, self.user)
        self.db.commit()
        self.assertTrue(pair.access_token)
        self.assertTrue("." in pair.refresh_token)
        payload = decode_access_token(pair.access_token)
        self.assertEqual(payload["sub"], self.user.id)
        self.assertIsNotNone(verify_refresh_token(self.db, pair.refresh_token, touch_last_used=False))

    def test_rotate_refresh_token_issues_new_pair(self):
        first = issue_token_pair(self.db, self.user)
        self.db.commit()
        second = rotate_refresh_token(self.db, first.refresh_token)
        self.db.commit()
        self.assertNotEqual(first.refresh_token, second.refresh_token)
        self.assertIsNotNone(second.access_token)
        self.assertIsNone(verify_refresh_token(self.db, first.refresh_token, touch_last_used=False))

    def test_rotate_rejects_expired_refresh(self):
        pair = issue_token_pair(self.db, self.user)
        record = (
            self.db.query(RefreshToken)
            .filter(RefreshToken.token_hash == hash_refresh_token(pair.refresh_token))
            .one()
        )
        record.expires_at = utcnow() - timedelta(minutes=1)
        self.db.commit()
        with self.assertRaises(HTTPException) as ctx:
            rotate_refresh_token(self.db, pair.refresh_token)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_rotate_rejects_revoked_refresh(self):
        pair = issue_token_pair(self.db, self.user)
        self.db.commit()
        rotate_refresh_token(self.db, pair.refresh_token)
        self.db.commit()
        with self.assertRaises(HTTPException) as ctx:
            rotate_refresh_token(self.db, pair.refresh_token)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_rotate_rejects_inactive_user(self):
        pair = issue_token_pair(self.db, self.user)
        self.user.is_active = False
        self.db.commit()
        with self.assertRaises(HTTPException) as ctx:
            rotate_refresh_token(self.db, pair.refresh_token)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_rotate_rejects_token_version_mismatch(self):
        pair = issue_token_pair(self.db, self.user)
        self.user.token_version = 1
        self.db.commit()
        with self.assertRaises(HTTPException) as ctx:
            rotate_refresh_token(self.db, pair.refresh_token)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_logout_all_revokes_refresh_tokens_and_bumps_version(self):
        pair = issue_token_pair(self.db, self.user)
        self.db.commit()
        old_access = pair.access_token
        logout_all_sessions(self.db, self.user)
        self.db.commit()
        self.assertEqual(self.user.token_version, 1)
        self.assertIsNone(verify_refresh_token(self.db, pair.refresh_token, touch_last_used=False))
        payload = decode_access_token(old_access)
        self.assertNotEqual(int(payload["ver"]), self.user.token_version)


def _mock_response() -> Mock:
    response = Mock()
    response.set_cookie = Mock()
    return response


class AuthTokenEndpointTests(unittest.TestCase):
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
    def test_refresh_endpoint_valid(self, _rate_limit):
        pair = issue_token_pair(self.db, self.user)
        self.db.commit()
        result = refresh_session(
            RefreshTokenIn(refresh_token=pair.refresh_token),
            _mock_request(),
            _mock_response(),
            self.db,
        )
        self.db.commit()
        self.assertNotEqual(result.refresh_token, pair.refresh_token)
        self.assertTrue(result.access_token)

    @patch("app.modules.auth.router.enforce_rate_limit")
    def test_logout_endpoint_revokes_current_refresh(self, _rate_limit):
        pair = issue_token_pair(self.db, self.user)
        self.db.commit()
        logout(RefreshTokenIn(refresh_token=pair.refresh_token), _mock_request(), _mock_response(), self.db)
        self.db.commit()
        self.assertIsNone(verify_refresh_token(self.db, pair.refresh_token, touch_last_used=False))

    @patch("app.modules.auth.router.log_action")
    def test_logout_all_endpoint(self, _log_action):
        pair = issue_token_pair(self.db, self.user)
        self.db.commit()
        result = logout_all(response=_mock_response(), current_user=self.user, db=self.db)
        self.db.commit()
        self.db.refresh(self.user)
        self.assertEqual(self.user.token_version, 1)
        self.assertIsNone(verify_refresh_token(self.db, pair.refresh_token, touch_last_used=False))
        self.assertIn("déconnectées", result.message.lower())


if __name__ == "__main__":
    unittest.main()
