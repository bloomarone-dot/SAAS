"""Émission et rotation des couples access / refresh token."""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import HTTPException, Request, status
from sqlalchemy.orm import Session

from app.modules.auth.models import RefreshToken
from app.modules.auth.refresh_tokens import (
    embedded_refresh_token_version,
    generate_refresh_token,
    hash_refresh_token,
    revoke_all_refresh_tokens,
    revoke_refresh_token,
    verify_refresh_token,
)
from app.modules.restaurants.models import Restaurant
from app.modules.users.models import User
from app.security import create_access_token

REFRESH_TOKEN_COOKIE_NAME = "refresh_token"


@dataclass(frozen=True)
class TokenPair:
    access_token: str
    refresh_token: str
    user: User


def extract_refresh_token(request: Request, body_token: str | None = None) -> str | None:
    """Lit le refresh token depuis le body JSON (tests) ou le cookie HttpOnly."""
    if body_token and body_token.strip():
        return body_token.strip()
    cookie_token = request.cookies.get(REFRESH_TOKEN_COOKIE_NAME)
    if cookie_token and cookie_token.strip():
        return cookie_token.strip()
    return None


def _client_ip(request: Request | None) -> str | None:
    if request is None or request.client is None:
        return None
    return request.client.host


def _client_user_agent(request: Request | None) -> str | None:
    if request is None:
        return None
    return request.headers.get("user-agent")


def ensure_user_eligible_for_tokens(db: Session, user: User) -> None:
    """Refuse les comptes inactifs ou rattachés à un restaurant suspendu."""
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Utilisateur invalide")

    if user.restaurant_id:
        restaurant = db.get(Restaurant, user.restaurant_id)
        if not restaurant or not restaurant.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Restaurant suspendu. Contactez l'administration de la plateforme.",
            )


def ensure_refresh_token_version_matches(user: User, raw_refresh_token: str) -> None:
    """Refuse un refresh émis avant un bump de token_version."""
    embedded = embedded_refresh_token_version(raw_refresh_token)
    current = int(getattr(user, "token_version", 0) or 0)
    if embedded is None or embedded != current:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expirée")


def issue_token_pair(
    db: Session,
    user: User,
    *,
    user_agent: str | None = None,
    ip_address: str | None = None,
) -> TokenPair:
    """Génère un access JWT et un refresh token hashé persisté en base."""
    ensure_user_eligible_for_tokens(db, user)
    version = int(getattr(user, "token_version", 0) or 0)
    access_token = create_access_token(user.id, version)
    generated = generate_refresh_token(token_version=version)
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_refresh_token(generated.token),
            jti=generated.jti,
            expires_at=generated.expires_at,
            user_agent=user_agent,
            ip_address=ip_address,
        )
    )
    db.flush()
    return TokenPair(access_token=access_token, refresh_token=generated.token, user=user)


def rotate_refresh_token(
    db: Session,
    raw_refresh_token: str,
    *,
    user_agent: str | None = None,
    ip_address: str | None = None,
) -> TokenPair:
    """Valide le refresh courant, le révoque et émet un nouveau couple rotatif (transaction atomique)."""
    with db.begin_nested():
        record = verify_refresh_token(db, raw_refresh_token, touch_last_used=False)
        if not record:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token invalide ou expiré")

        user = db.get(User, record.user_id)
        ensure_user_eligible_for_tokens(db, user)
        ensure_refresh_token_version_matches(user, raw_refresh_token)

        revoke_refresh_token(db, record)
        pair = issue_token_pair(db, user, user_agent=user_agent, ip_address=ip_address)
    return pair


def logout_refresh_token(db: Session, raw_refresh_token: str) -> bool:
    """Révoque uniquement le refresh token fourni."""
    return revoke_refresh_token(db, raw_token=raw_refresh_token)


def logout_all_sessions(db: Session, user: User) -> None:
    """Invalide tous les access JWT (token_version) et refresh tokens actifs."""
    user.token_version = (getattr(user, "token_version", 0) or 0) + 1
    revoke_all_refresh_tokens(db, user.id)
