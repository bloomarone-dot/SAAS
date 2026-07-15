import os

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.email import is_email_configured, send_password_reset_email
from app.ratelimit import enforce_rate_limit
from app.modules.audit.service import log_action
from app.modules.auth.schemas import ChangePasswordIn, ForgotPasswordIn, ForgotPasswordOut, LoginIn, ResetPasswordIn, TokenOut
from app.modules.permissions.models import Role
from app.modules.restaurants.models import Restaurant
from app.modules.restaurants.schemas import RestaurantBrandingPublic
from app.modules.users.models import User
from app.modules.users.schemas import UserPublic
from app.security import (
    PASSWORD_RESET_TOKEN_EXPIRE_MINUTES,
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

    if user.restaurant_id:
        restaurant = db.get(Restaurant, user.restaurant_id)
        if not restaurant or not restaurant.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Restaurant suspendu. Contactez l'administration de la plateforme.",
            )

    log_action(db, user, "auth.login", "user", user.id, f"Connexion utilisateur {user.username}")
    db.commit()
    token = create_access_token(user.id, getattr(user, "token_version", 0) or 0)
    return TokenOut(access_token=token, user=user)


def _build_reset_link(token: str) -> str:
    base = os.getenv("APP_PUBLIC_URL", "").rstrip("/") or "http://localhost:5177"
    return f"{base}/reset-password?token={token}"


@router.post("/superadmin/login", response_model=TokenOut)
def superadmin_login(payload: LoginIn, request: Request, db: Session = Depends(get_db)):
    """Connexion réservée au super administrateur (espace plateforme séparé)."""
    enforce_rate_limit(request, scope="login", limit=10, window_seconds=300)
    user = find_user_by_login(db, payload.login)
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Identifiants invalides")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Compte desactive")
    if user.role != Role.SUPERADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cet espace est réservé à l'administration de la plateforme.")
    log_action(db, user, "auth.login", "user", user.id, f"Connexion superadmin {user.username}")
    db.commit()
    token = create_access_token(user.id, getattr(user, "token_version", 0) or 0)
    return TokenOut(access_token=token, user=user)


@router.post("/restaurants/{slug}/login", response_model=TokenOut)
def restaurant_login(slug: str, payload: LoginIn, request: Request, db: Session = Depends(get_db)):
    """Connexion dédiée à un restaurant : l'utilisateur doit appartenir à ce restaurant."""
    enforce_rate_limit(request, scope="login", limit=10, window_seconds=300)
    tenant_key = slug.strip().lower()
    restaurant = (
        db.query(Restaurant)
        .filter(
            or_(
                func.lower(Restaurant.slug) == tenant_key,
                func.lower(Restaurant.subdomain) == tenant_key,
                func.replace(func.lower(Restaurant.slug), "-", "") == tenant_key,
            )
        )
        .one_or_none()
    )
    if not restaurant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Restaurant introuvable")
    if not restaurant.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cet espace est temporairement indisponible (restaurant suspendu).")
    user = find_user_by_login(db, payload.login)
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Identifiants invalides")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Compte desactive")
    if user.role == Role.SUPERADMIN or user.restaurant_id != restaurant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Ce compte n'appartient pas à ce restaurant.")
    log_action(db, user, "auth.login", "user", user.id, f"Connexion {user.username} ({restaurant.slug})")
    db.commit()
    token = create_access_token(user.id, getattr(user, "token_version", 0) or 0)
    return TokenOut(
        access_token=token,
        user=user,
        restaurant_branding=RestaurantBrandingPublic(
            id=restaurant.id,
            name=restaurant.name,
            slug=restaurant.slug,
            logo_url=restaurant.logo_url,
            primary_color=restaurant.primary_color,
            secondary_color=restaurant.secondary_color,
            accent_color=restaurant.accent_color or "#F59E0B",
        ),
    )


@router.post("/forgot-password", response_model=ForgotPasswordOut)
def forgot_password(
    payload: ForgotPasswordIn,
    request: Request,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Envoie un lien de reinitialisation par email si le compte existe."""
    enforce_rate_limit(request, scope="forgot", limit=5, window_seconds=900)
    user = find_user_by_login(db, payload.login)
    # Message generique systematique: pas d'enumeration de comptes.
    generic_message = "Si le compte existe, un lien de réinitialisation a été envoyé par email."
    if not user or not user.is_active:
        return ForgotPasswordOut(message=generic_message)

    reset_token = create_password_reset_token(user.id)
    if user.email:
        # Envoi en tache de fond: ne bloque pas la reponse et n'expose pas le resultat.
        background.add_task(
            send_password_reset_email,
            user.email,
            _build_reset_link(reset_token),
            PASSWORD_RESET_TOKEN_EXPIRE_MINUTES,
        )
    log_action(db, user, "auth.password_reset_requested", "user", user.id, f"Demande de reinitialisation {user.username}")
    db.commit()

    # En dev (SMTP non configure), on peut renvoyer le token pour faciliter les tests.
    if not (ENVIRONMENT in {"production", "prod"}) and RETURN_DEV_RESET_TOKEN and not is_email_configured():
        return ForgotPasswordOut(message=generic_message, reset_token=reset_token)
    return ForgotPasswordOut(message=generic_message)


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


@router.post("/change-password", response_model=TokenOut)
def change_password(
    payload: ChangePasswordIn,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Permet a l'utilisateur connecte de changer son propre mot de passe."""
    enforce_rate_limit(request, scope="change-password", limit=10, window_seconds=900)
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mot de passe actuel incorrect")
    if verify_password(payload.new_password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Le nouveau mot de passe doit être différent de l'ancien")

    current_user.password_hash = hash_password(payload.new_password)
    # Revoque les autres sessions, puis re-emet un jeton valide pour la session courante.
    current_user.token_version = (getattr(current_user, "token_version", 0) or 0) + 1
    log_action(db, current_user, "auth.password_change", "user", current_user.id, f"Changement mot de passe {current_user.username}")
    db.commit()
    db.refresh(current_user)
    token = create_access_token(current_user.id, current_user.token_version)
    return TokenOut(access_token=token, user=current_user)


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
