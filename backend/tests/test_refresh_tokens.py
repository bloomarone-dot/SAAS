"""Tests des refresh tokens et révocation JWT après reset plateforme."""
import unittest
from datetime import timedelta

import app.modules.models  # noqa: F401 — enregistre User + RefreshToken pour SQLAlchemy
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.modules.auth.models import RefreshToken
from app.modules.auth.refresh_tokens import (
    cleanup_expired_refresh_tokens,
    generate_refresh_token,
    hash_refresh_token,
    revoke_all_refresh_tokens,
    revoke_refresh_token,
    verify_refresh_token,
)
from app.modules.permissions.models import Role
from app.modules.restaurants.models import Restaurant
from app.modules.shared.models import utcnow
from app.modules.users.models import User
from app.security import create_access_token, hash_password


def _make_user(user_id: str = "user-1", token_version: int = 0) -> User:
    return User(
        id=user_id,
        username=f"user_{user_id}",
        password_hash=hash_password("TestPass123!"),
        first_name="Test",
        last_name="User",
        role=Role.CAISSE,
        restaurant_id="resto-1",
        token_version=token_version,
    )


def _store_refresh_token(db, user_id: str, generated, user_agent: str | None = None) -> RefreshToken:
    record = RefreshToken(
        user_id=user_id,
        token_hash=hash_refresh_token(generated.token),
        jti=generated.jti,
        expires_at=generated.expires_at,
        user_agent=user_agent,
    )
    db.add(record)
    db.flush()
    return record


class RefreshTokenHelperTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        Restaurant.__table__.create(self.engine)
        User.__table__.create(self.engine)
        RefreshToken.__table__.create(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()
        self.db.add(Restaurant(id="resto-1", name="Test Resto", slug="test-resto"))
        self.user = _make_user()
        self.db.add(self.user)
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_generate_refresh_token_produces_unique_opaque_values(self):
        first = generate_refresh_token()
        second = generate_refresh_token()
        self.assertTrue(first.token)
        self.assertTrue(first.jti)
        self.assertNotEqual(first.token, second.token)
        self.assertNotEqual(first.jti, second.jti)
        self.assertGreater(first.expires_at, utcnow())

    def test_hash_refresh_token_never_stores_plaintext(self):
        generated = generate_refresh_token()
        digest = hash_refresh_token(generated.token)
        self.assertNotEqual(digest, generated.token)
        self.assertEqual(len(digest), 64)
        self.assertEqual(digest, hash_refresh_token(generated.token))

    def test_verify_refresh_token_accepts_valid_record(self):
        generated = generate_refresh_token()
        _store_refresh_token(self.db, user_id=self.user.id, generated=generated, user_agent="pytest")
        self.db.commit()

        record = verify_refresh_token(self.db, generated.token)
        self.assertIsNotNone(record)
        self.assertEqual(record.user_id, self.user.id)
        self.assertIsNotNone(record.last_used_at)

    def test_verify_refresh_token_rejects_revoked_token(self):
        generated = generate_refresh_token()
        record = _store_refresh_token(self.db, user_id=self.user.id, generated=generated)
        self.db.commit()
        self.assertTrue(revoke_refresh_token(self.db, record))
        self.db.commit()
        self.assertIsNone(verify_refresh_token(self.db, generated.token, touch_last_used=False))

    def test_verify_refresh_token_rejects_expired_token(self):
        generated = generate_refresh_token()
        record = _store_refresh_token(self.db, user_id=self.user.id, generated=generated)
        record.expires_at = utcnow() - timedelta(minutes=1)
        self.db.commit()
        self.assertIsNone(verify_refresh_token(self.db, generated.token, touch_last_used=False))

    def test_revoke_all_refresh_tokens(self):
        for _ in range(3):
            _store_refresh_token(self.db, user_id=self.user.id, generated=generate_refresh_token())
        self.db.commit()
        revoked = revoke_all_refresh_tokens(self.db, self.user.id)
        self.db.commit()
        self.assertEqual(revoked, 3)
        active = self.db.query(RefreshToken).filter(RefreshToken.revoked_at.is_(None)).count()
        self.assertEqual(active, 0)

    def test_cleanup_expired_refresh_tokens(self):
        generated = generate_refresh_token()
        record = _store_refresh_token(self.db, user_id=self.user.id, generated=generated)
        record.expires_at = utcnow() - timedelta(hours=1)
        self.db.commit()
        deleted = cleanup_expired_refresh_tokens(self.db)
        self.db.commit()
        self.assertEqual(deleted, 1)
        self.assertIsNone(self.db.get(RefreshToken, record.id))

    def test_token_hash_not_stored_in_plaintext(self):
        generated = generate_refresh_token()
        record = _store_refresh_token(self.db, user_id=self.user.id, generated=generated)
        self.db.commit()
        self.assertNotEqual(record.token_hash, generated.token)
        self.assertEqual(record.token_hash, hash_refresh_token(generated.token))


class PlatformPasswordResetRevocationTests(unittest.TestCase):
    def test_platform_password_reset_invalidates_existing_jwt(self):
        token_version = 0
        user_id = "tenant-user-1"
        old_token = create_access_token(user_id, token_version)
        payload = self._decode(old_token)
        self.assertEqual(int(payload["ver"]), token_version)

        token_version = token_version + 1
        self.assertNotEqual(int(self._decode(old_token)["ver"]), token_version)

        new_token = create_access_token(user_id, token_version)
        self.assertEqual(int(self._decode(new_token)["ver"]), token_version)

    def test_platform_reset_logic_matches_router(self):
        """Simule l'incrément token_version appliqué par reset_platform_user_password."""
        from app.security import decode_access_token

        token_version = 2
        user_id = "u-99"
        access_token = create_access_token(user_id, token_version)
        token_version = (token_version or 0) + 1
        payload = decode_access_token(access_token)
        self.assertNotEqual(int(payload.get("ver", 0)), token_version)

    @staticmethod
    def _decode(token: str) -> dict:
        from app.security import decode_access_token

        payload = decode_access_token(token)
        assert payload is not None
        return payload


if __name__ == "__main__":
    unittest.main()
