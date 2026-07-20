"""Résolution unifiée du jeton d'accès (Bearer prioritaire, cookie préparatoire)."""

from __future__ import annotations

from fastapi import HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.modules.restaurants.models import Restaurant
from app.modules.users.models import User
from app.security import AUTH_MODE, decode_access_token

ACCESS_TOKEN_COOKIE_NAME = "access_token"


def resolve_access_token(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None,
) -> str | None:
    """Retourne le JWT d'accès : Bearer en priorité, puis cookie (mode dual uniquement)."""
    if credentials and credentials.credentials:
        return credentials.credentials

    if AUTH_MODE == "dual":
        cookie_token = request.cookies.get(ACCESS_TOKEN_COOKIE_NAME)
        if cookie_token and cookie_token.strip():
            return cookie_token.strip()

    return None


def authenticate_user_from_access_token(db: Session, token: str) -> User:
    """Valide un JWT d'accès et retourne l'utilisateur authentifié."""
    payload = decode_access_token(token)
    user_id = payload.get("sub") if payload else None

    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalide")

    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Utilisateur invalide")

    if int(payload.get("ver", 0)) != int(getattr(user, "token_version", 0) or 0):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expirée")

    if user.restaurant_id:
        restaurant = db.get(Restaurant, user.restaurant_id)
        if not restaurant or not restaurant.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Restaurant suspendu. Contactez l'administration de la plateforme.",
            )

    return user
