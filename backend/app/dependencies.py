from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.modules.auth.auth_resolution import authenticate_user_from_access_token, resolve_access_token
from app.modules.permissions.models import Permission, Role
from app.modules.users.models import User


bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Recupere l'utilisateur authentifie depuis Bearer (prioritaire) ou cookie access."""
    token = resolve_access_token(request, credentials)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalide")
    return authenticate_user_from_access_token(db, token)


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
