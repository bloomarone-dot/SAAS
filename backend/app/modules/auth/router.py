from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
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
def login(payload: LoginIn, db: Session = Depends(get_db)):
    """Authentifie par email, username ou telephone et retourne un bearer token."""
    user = find_user_by_login(db, payload.login)

    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Identifiants invalides")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Compte desactive")

    log_action(db, user, "auth.login", "user", user.id, f"Connexion utilisateur {user.username}")
    db.commit()
    return TokenOut(access_token=create_access_token(user.id), user=user)


@router.post("/forgot-password", response_model=ForgotPasswordOut)
def forgot_password(payload: ForgotPasswordIn, db: Session = Depends(get_db)):
    """Genere un token temporaire de reinitialisation si le compte existe."""
    user = find_user_by_login(db, payload.login)
    generic_message = "Si le compte existe, un code de réinitialisation a été généré."
    if not user or not user.is_active:
        return ForgotPasswordOut(message=generic_message)

    return ForgotPasswordOut(
        message=generic_message,
        reset_token=create_password_reset_token(user.id),
    )


@router.post("/reset-password")
def reset_password(payload: ResetPasswordIn, db: Session = Depends(get_db)):
    """Remplace le mot de passe a partir d'un token de reinitialisation valide."""
    token_payload = decode_password_reset_token(payload.token)
    user_id = token_payload.get("sub") if token_payload else None
    if not user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Code de réinitialisation invalide")

    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Compte invalide")

    user.password_hash = hash_password(payload.password)
    db.commit()
    return {"message": "Mot de passe réinitialisé avec succès"}


@router.get("/me", response_model=UserPublic)
def me(current_user: User = Depends(get_current_user)):
    """Retourne le profil et les permissions de l'utilisateur connecte."""
    return current_user
