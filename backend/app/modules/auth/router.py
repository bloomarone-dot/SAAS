import os

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.ratelimit import enforce_rate_limit
from app.modules.audit.service import log_action
from app.modules.auth.schemas import ForgotPasswordIn, ForgotPasswordOut, LoginIn, ResetPasswordIn, TokenOut
from app.modules.users.models import User
from app.modules.users.schemas import UserPublic
from app.security import (
    create_access_token,
    create_password_reset_token,
    decode_password_reset_token,
    hash_password,
    verify_password,
)


router = APIRouter(prefix="/auth", tags=["auth"])
ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()
RETURN_DEV_RESET_TOKEN = os.getenv("RETURN_DEV_RESET_TOKEN", "true").lower() == "true"


def normalize_phone(value: str) -> str:
    """Normalise legerement un numero pour les recherches exactes courantes."""
    return "".join(character for character in value if character.isdigit())


def find_user_by_login(db: Session, login: str) -> User | None:
    """Recherche un utilisateur par email, username ou telephone."""
    login_raw = login.strip()
    login_value = login_raw.lower()
    phone_value = normalize_phone(login_raw)
    phone_candidates = {login_raw, phone_value}
    if phone_value:
        phone_candidates.add(f"+{phone_value}")

    return (
        db.query(User)
        .filter(
            or_(
                User.email == login_value,
                User.username == login_value,
                User.phone.in_(phone_candidates),
            )
        )
        .first()
    )


@router.post("/login", response_model=TokenOut)
def login(payload: LoginIn, request: Request, db: Session = Depends(get_db)):
    """Authentifie par email, username ou telephone et retourne un bearer token."""
    enforce_rate_limit(request, scope="login", limit=10, window_seconds=300)
    user = find_user_by_login(db, payload.login)

    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Identifiants invalides")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Compte desactive")

    log_action(db, user, "auth.login", "user", user.id, f"Connexion utilisateur {user.username}")
    db.commit()
    token = create_access_token(user.id, getattr(user, "token_version", 0) or 0)
    return TokenOut(access_token=token, user=user)


@router.post("/forgot-password", response_model=ForgotPasswordOut)
def forgot_password(payload: ForgotPasswordIn, request: Request, db: Session = Depends(get_db)):
    """Genere un token temporaire de reinitialisation si le compte existe."""
    enforce_rate_limit(request, scope="forgot", limit=5, window_seconds=900)
    user = find_user_by_login(db, payload.login)
    generic_message = "Si le compte existe, un code de réinitialisation a été généré."
    if not user or not user.is_active:
        return ForgotPasswordOut(message=generic_message)

    reset_token = create_password_reset_token(user.id)
    if ENVIRONMENT in {"production", "prod"} or not RETURN_DEV_RESET_TOKEN:
        return ForgotPasswordOut(message=generic_message)

    return ForgotPasswordOut(message=generic_message, reset_token=reset_token)


@router.post("/reset-password")
def reset_password(payload: ResetPasswordIn, request: Request, db: Session = Depends(get_db)):
    """Remplace le mot de passe a partir d'un token de reinitialisation valide."""
    enforce_rate_limit(request, scope="reset", limit=10, window_seconds=900)
    token_payload = decode_password_reset_token(payload.token)
    user_id = token_payload.get("sub") if token_payload else None
    if not user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Code de réinitialisation invalide")

    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Compte invalide")

    user.password_hash = hash_password(payload.password)
    # Invalide tous les jetons existants apres changement de mot de passe.
    user.token_version = (getattr(user, "token_version", 0) or 0) + 1
    log_action(db, user, "auth.password_reset", "user", user.id, f"Reinitialisation mot de passe {user.username}")
    db.commit()
    return {"message": "Mot de passe réinitialisé avec succès"}


@router.get("/me", response_model=UserPublic)
def me(current_user: User = Depends(get_current_user)):
    """Retourne le profil et les permissions de l'utilisateur connecte."""
    return current_user


@router.post("/logout-all")
def logout_all(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Revoque toutes les sessions actives de l'utilisateur (vol de jeton, appareil perdu)."""
    current_user.token_version = (getattr(current_user, "token_version", 0) or 0) + 1
    log_action(db, current_user, "auth.logout_all", "user", current_user.id, "Deconnexion globale")
    db.commit()
    return {"message": "Toutes les sessions ont été déconnectées"}
