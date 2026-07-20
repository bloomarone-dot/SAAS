"""Helpers pour les refresh tokens opaques (hashés en base)."""

from __future__ import annotations

import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.modules.auth.models import RefreshToken
from app.modules.shared.models import new_id, utcnow
from app.security import REFRESH_TOKEN_BYTES, REFRESH_TOKEN_EXPIRE_DAYS, SECRET_KEY


@dataclass(frozen=True)
class GeneratedRefreshToken:
    """Valeurs produites à l'émission d'un refresh token (avant persistance)."""

    token: str
    jti: str
    expires_at: datetime


def generate_refresh_token(*, token_version: int = 0) -> GeneratedRefreshToken:
    """Génère un jeton opaque aléatoire avec la version de session embarquée."""
    inner = secrets.token_urlsafe(REFRESH_TOKEN_BYTES)
    token = f"{int(token_version)}.{inner}"
    jti = new_id()
    expires_at = utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    return GeneratedRefreshToken(token=token, jti=jti, expires_at=expires_at)


def embedded_refresh_token_version(raw_token: str) -> int | None:
    """Extrait la version de session embarquée dans le refresh token opaque."""
    if "." not in raw_token:
        return None
    prefix, _, _ = raw_token.partition(".")
    try:
        return int(prefix)
    except ValueError:
        return None


def hash_refresh_token(raw_token: str) -> str:
    """Hash HMAC-SHA256 du jeton — jamais stocker raw_token en clair."""
    return hmac.new(SECRET_KEY.encode(), raw_token.encode(), hashlib.sha256).hexdigest()


def verify_refresh_token(db: Session, raw_token: str, *, touch_last_used: bool = True) -> RefreshToken | None:
    """Retourne l'enregistrement valide correspondant au jeton brut, ou None."""
    token_hash = hash_refresh_token(raw_token)
    record = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).one_or_none()
    if not record:
        return None
    if record.revoked_at is not None:
        return None
    if record.expires_at <= utcnow():
        return None
    if touch_last_used:
        record.last_used_at = utcnow()
        db.flush()
    return record


def revoke_refresh_token(
    db: Session,
    token: RefreshToken | str | None = None,
    *,
    raw_token: str | None = None,
) -> bool:
    """Révoque un refresh token par instance, id ou jeton brut. Retourne False si introuvable."""
    record: RefreshToken | None
    if isinstance(token, RefreshToken):
        record = token
    elif raw_token:
        record = verify_refresh_token(db, raw_token, touch_last_used=False)
    elif token:
        record = db.get(RefreshToken, token)
    else:
        return False

    if not record or record.revoked_at is not None:
        return False

    record.revoked_at = utcnow()
    db.flush()
    return True


def revoke_all_refresh_tokens(db: Session, user_id: str) -> int:
    """Révoque tous les refresh tokens actifs d'un utilisateur. Retourne le nombre révoqué."""
    now = utcnow()
    tokens = (
        db.query(RefreshToken)
        .filter(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .all()
    )
    for record in tokens:
        record.revoked_at = now
    db.flush()
    return len(tokens)


def cleanup_expired_refresh_tokens(db: Session) -> int:
    """Supprime les refresh tokens expirés. Retourne le nombre supprimé."""
    expired = db.query(RefreshToken).filter(RefreshToken.expires_at <= utcnow()).all()
    count = len(expired)
    for record in expired:
        db.delete(record)
    db.flush()
    return count
