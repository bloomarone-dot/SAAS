"""Cookies HttpOnly pour les refresh tokens (mode dual)."""

from __future__ import annotations

from fastapi import Response

from app.modules.auth.token_service import REFRESH_TOKEN_COOKIE_NAME
from app.security import AUTH_MODE, COOKIE_DOMAIN, COOKIE_SAMESITE, COOKIE_SECURE, REFRESH_TOKEN_EXPIRE_DAYS

REFRESH_TOKEN_COOKIE_PATH = "/api/v1/auth"
REFRESH_TOKEN_MAX_AGE_SECONDS = REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60


def auth_uses_refresh_cookies() -> bool:
    return AUTH_MODE == "dual"


def set_refresh_token_cookie(response: Response, raw_token: str) -> None:
    """Pose le cookie HttpOnly refresh_token (mode dual uniquement)."""
    if not auth_uses_refresh_cookies():
        return

    response.set_cookie(
        key=REFRESH_TOKEN_COOKIE_NAME,
        value=raw_token,
        max_age=REFRESH_TOKEN_MAX_AGE_SECONDS,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        domain=COOKIE_DOMAIN,
        path=REFRESH_TOKEN_COOKIE_PATH,
    )


def clear_refresh_token_cookie(response: Response) -> None:
    """Supprime le cookie refresh_token côté navigateur."""
    if not auth_uses_refresh_cookies():
        return

    response.set_cookie(
        key=REFRESH_TOKEN_COOKIE_NAME,
        value="",
        max_age=0,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        domain=COOKIE_DOMAIN,
        path=REFRESH_TOKEN_COOKIE_PATH,
    )
