from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import (
    assert_owner_or_permission,
    assert_permission,
    assert_staff_role,
    require_tenant_user,
)
from app.modules.branches.models import Branch
from app.modules.shared.models import Permission, Role
from app.modules.users.models import User, UserPermission
from app.modules.users.schemas import PermissionPublic, UserCreateIn, UserPermissionsUpdateIn, UserPublic
from app.security import hash_password


router = APIRouter(prefix="/users", tags=["users"])


PERMISSION_LABELS: dict[Permission, str] = {
    Permission.RESTAURANT_SETTINGS_READ: "Voir la configuration du restaurant",
    Permission.RESTAURANT_SETTINGS_UPDATE: "Modifier la configuration du restaurant",
    Permission.BRANCH_READ: "Voir les branches",
    Permission.BRANCH_CREATE: "Creer des branches",
    Permission.BRANCH_UPDATE: "Modifier les branches",
    Permission.USER_READ: "Voir le personnel",
    Permission.USER_CREATE: "Creer le personnel",
    Permission.USER_UPDATE: "Modifier le personnel",
    Permission.USER_PERMISSIONS_UPDATE: "Attribuer les permissions",
    Permission.SERVICE_READ: "Voir le service en salle",
    Permission.SERVICE_UPDATE: "Gerer le service en salle",
    Permission.KITCHEN_READ: "Voir la cuisine",
    Permission.KITCHEN_UPDATE: "Gerer la cuisine",
    Permission.CASHIER_READ: "Voir la caisse",
    Permission.CASHIER_UPDATE: "Gerer la caisse",
    Permission.STOCK_READ: "Voir les stocks",
    Permission.STOCK_UPDATE: "Gerer les stocks",
    Permission.ACCOUNTING_READ: "Voir la comptabilite",
    Permission.ACCOUNTING_UPDATE: "Gerer la comptabilite",
}


def replace_user_permissions(
    db: Session,
    user: User,
    permissions: list[Permission],
    granted_by_id: str,
) -> None:
    """Remplace toutes les permissions explicites d'un utilisateur."""
    db.query(UserPermission).filter(UserPermission.user_id == user.id).delete()
    for permission in sorted(set(permissions), key=lambda item: item.value):
        db.add(
            UserPermission(
                user_id=user.id,
                permission=permission,
                granted_by_id=granted_by_id,
            )
        )


@router.get("", response_model=list[UserPublic])
def list_users(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    """Liste le personnel du restaurant courant."""
    assert_permission(current_user, Permission.USER_READ)
    return (
        db.query(User)
        .filter(User.restaurant_id == current_user.restaurant_id)
        .order_by(User.created_at.desc())
        .all()
    )


@router.post("", response_model=UserPublic, status_code=201)
def create_user(
    payload: UserCreateIn,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    """Cree un compte personnel avec des permissions optionnelles."""
    assert_permission(current_user, Permission.USER_CREATE)
    assert_staff_role(payload.role)
    if payload.permissions:
        assert_owner_or_permission(current_user, Permission.USER_PERMISSIONS_UPDATE)

    email = payload.email.lower().strip()
    username = payload.username.lower().strip()
    existing_user = (
        db.query(User)
        .filter(or_(User.email == email, User.username == username))
        .one_or_none()
    )
    if existing_user:
        raise HTTPException(status_code=409, detail="Email ou nom utilisateur deja utilise")

    if payload.branch_id:
        branch = db.get(Branch, payload.branch_id)
        if not branch or branch.restaurant_id != current_user.restaurant_id:
            raise HTTPException(status_code=400, detail="Branche invalide pour ce restaurant")

    user = User(
        email=email,
        username=username,
        password_hash=hash_password(payload.password),
        first_name=payload.first_name,
        last_name=payload.last_name,
        phone=payload.phone,
        role=payload.role,
        restaurant_id=current_user.restaurant_id,
        branch_id=payload.branch_id,
        created_by_id=current_user.id,
    )
    db.add(user)
    db.flush()
    replace_user_permissions(db, user, payload.permissions, current_user.id)
    db.commit()
    db.refresh(user)
    return user


@router.get("/permissions", response_model=list[PermissionPublic])
def list_available_permissions(current_user: User = Depends(require_tenant_user)):
    """Expose les permissions attribuables depuis l'interface d'administration."""
    assert_permission(current_user, Permission.USER_PERMISSIONS_UPDATE)
    return [
        PermissionPublic(key=permission, label=PERMISSION_LABELS[permission])
        for permission in sorted(Permission, key=lambda item: item.value)
    ]


@router.put("/{user_id}/permissions", response_model=UserPublic)
def update_user_permissions(
    user_id: str,
    payload: UserPermissionsUpdateIn,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    """Remplace les droits precis d'un utilisateur du meme restaurant."""
    assert_owner_or_permission(current_user, Permission.USER_PERMISSIONS_UPDATE)

    user = db.get(User, user_id)
    if not user or user.restaurant_id != current_user.restaurant_id:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    if user.is_owner or user.role == Role.SUPERADMIN:
        raise HTTPException(status_code=400, detail="Les permissions du proprietaire ne sont pas modifiables")

    replace_user_permissions(db, user, payload.permissions, current_user.id)
    db.commit()
    db.refresh(user)
    return user
