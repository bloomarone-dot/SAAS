from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.modules.permissions.models import Permission, Role
from app.modules.restaurants.models import Restaurant
from app.modules.users.models import User
from app.security import decode_access_token


bearer_scheme = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Recupere l'utilisateur authentifie depuis le bearer token."""
    payload = decode_access_token(credentials.credentials)
    user_id = payload.get("sub") if payload else None

    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalide")

    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Utilisateur invalide")

    # Revocation: un jeton emis avant un reset de mot de passe ou une deconnexion
    # globale porte une version anterieure et n'est plus accepte.
    if int(payload.get("ver", 0)) != int(getattr(user, "token_version", 0) or 0):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expirée")

    # Suspension tenant: un restaurant suspendu (ou impaye) bloque tous ses comptes,
    # quel que soit le jeton deja emis. Le superadmin (sans restaurant) n'est pas concerne.
    if user.restaurant_id:
        restaurant = db.get(Restaurant, user.restaurant_id)
        if not restaurant or not restaurant.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Restaurant suspendu. Contactez l'administration de la plateforme.",
            )

    return user


def require_tenant_user(current_user: User = Depends(get_current_user)) -> User:
    """Autorise uniquement les utilisateurs rattaches a un restaurant."""
    if current_user.role == Role.SUPERADMIN or not current_user.restaurant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Utilisateur restaurant requis")
    return current_user


def require_restaurant_admin(current_user: User = Depends(get_current_user)) -> User:
    """Autorise uniquement l'administrateur principal d'un restaurant."""
    if current_user.role != Role.ADMIN or not current_user.restaurant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrateur restaurant requis")
    return current_user


def has_permission(user: User, permission: Permission) -> bool:
    """Teste une permission en tenant compte du role, du owner et des grants."""
    return permission in user.permissions


def assert_permission(user: User, permission: Permission) -> None:
    """Bloque la requete si l'utilisateur n'a pas le droit requis."""
    if not has_permission(user, permission):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Permission requise: {permission.value}",
        )


def assert_owner_or_permission(user: User, permission: Permission) -> None:
    """Autorise toujours le proprietaire, sinon exige la permission precise."""
    if user.is_owner:
        return
    assert_permission(user, permission)


def assert_staff_role(role: Role) -> None:
    """Empeche un tenant admin de creer des comptes globaux ou proprietaires."""
    if role in {Role.SUPERADMIN, Role.ADMIN}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Un administrateur restaurant ne peut pas creer ce role.",
        )
