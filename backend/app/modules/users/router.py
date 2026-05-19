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
from app.modules.permissions.models import Permission, ROLE_DEFAULT_PERMISSIONS, Role
from app.modules.permissions.schemas import PermissionGroupPublic, PermissionPublic, RolePresetPublic
from app.modules.permissions.service import get_permission_groups, get_permissions, get_role_presets
from app.modules.users.models import User, UserPermission
from app.modules.users.schemas import (
    UserCreateIn,
    UserPermissionsUpdateIn,
    UserPublic,
    UserStatusUpdateIn,
    UserUpdateIn,
)
from app.security import hash_password


router = APIRouter(prefix="/users", tags=["users"])


def replace_user_permissions(
    db: Session,
    user: User,
    permissions: list[Permission],
    granted_by_id: str,
) -> None:
    """Remplace toutes les permissions explicites d'un utilisateur."""
    db.query(UserPermission).filter(UserPermission.user_id == user.id).delete()
    role_defaults = ROLE_DEFAULT_PERMISSIONS.get(user.role, set())
    explicit_permissions = set(permissions).difference(role_defaults)
    for permission in sorted(explicit_permissions, key=lambda item: item.value):
        db.add(
            UserPermission(
                user_id=user.id,
                permission=permission,
                granted_by_id=granted_by_id,
            )
        )


def assert_managed_user(current_user: User, user: User) -> None:
    """Verifie que l'utilisateur cible appartient au meme restaurant et reste modifiable."""
    if user.restaurant_id != current_user.restaurant_id:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    if user.is_owner or user.role == Role.SUPERADMIN:
        raise HTTPException(status_code=400, detail="Le compte proprietaire n'est pas modifiable ici")


def validate_branch(db: Session, branch_id: str | None, restaurant_id: str | None) -> None:
    """Valide qu'une branche appartient bien au restaurant courant."""
    if not branch_id:
        return

    branch = db.get(Branch, branch_id)
    if not branch or branch.restaurant_id != restaurant_id:
        raise HTTPException(status_code=400, detail="Branche invalide pour ce restaurant")


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

    validate_branch(db, payload.branch_id, current_user.restaurant_id)

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
    return get_permissions()


@router.get("/permission-groups", response_model=list[PermissionGroupPublic])
def list_permission_groups(current_user: User = Depends(require_tenant_user)):
    """Expose le catalogue de permissions groupe par module fonctionnel."""
    assert_permission(current_user, Permission.USER_PERMISSIONS_UPDATE)
    return get_permission_groups()


@router.get("/role-presets", response_model=list[RolePresetPublic])
def list_role_presets(current_user: User = Depends(require_tenant_user)):
    """Retourne les permissions par defaut des roles que l'admin peut attribuer."""
    assert_permission(current_user, Permission.USER_READ)
    return get_role_presets()


@router.patch("/{user_id}", response_model=UserPublic)
def update_user(
    user_id: str,
    payload: UserUpdateIn,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    """Modifie les informations, le role et optionnellement les droits d'un utilisateur."""
    assert_permission(current_user, Permission.USER_UPDATE)
    if payload.permissions is not None:
        assert_owner_or_permission(current_user, Permission.USER_PERMISSIONS_UPDATE)

    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    assert_managed_user(current_user, user)

    if payload.role is not None:
        assert_staff_role(payload.role)
        user.role = payload.role

    validate_branch(db, payload.branch_id, current_user.restaurant_id)

    if payload.email is not None:
        email = payload.email.lower().strip()
        existing_user = db.query(User).filter(User.email == email, User.id != user.id).one_or_none()
        if existing_user:
            raise HTTPException(status_code=409, detail="Email deja utilise")
        user.email = email

    if payload.username is not None:
        username = payload.username.lower().strip()
        existing_user = db.query(User).filter(User.username == username, User.id != user.id).one_or_none()
        if existing_user:
            raise HTTPException(status_code=409, detail="Nom utilisateur deja utilise")
        user.username = username

    fields_set = getattr(payload, "model_fields_set", None)
    if fields_set is None:
        fields_set = payload.__fields_set__
    for field in ("first_name", "last_name", "phone", "branch_id"):
        value = getattr(payload, field)
        if field in fields_set:
            setattr(user, field, value)

    if payload.permissions is not None:
        replace_user_permissions(db, user, payload.permissions, current_user.id)

    db.commit()
    db.refresh(user)
    return user


@router.patch("/{user_id}/status", response_model=UserPublic)
def update_user_status(
    user_id: str,
    payload: UserStatusUpdateIn,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    """Active ou desactive un compte utilisateur sans supprimer son historique."""
    assert_permission(current_user, Permission.USER_UPDATE)

    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    assert_managed_user(current_user, user)

    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas desactiver votre propre compte")

    user.is_active = payload.is_active
    db.commit()
    db.refresh(user)
    return user


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
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    assert_managed_user(current_user, user)

    replace_user_permissions(db, user, payload.permissions, current_user.id)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=204)
def delete_user(
    user_id: str,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    """Supprime un utilisateur non proprietaire du restaurant courant."""
    assert_permission(current_user, Permission.USER_UPDATE)

    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    assert_managed_user(current_user, user)

    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas supprimer votre propre compte")

    db.query(User).filter(User.created_by_id == user.id).update({User.created_by_id: None})
    db.query(UserPermission).filter(UserPermission.granted_by_id == user.id).update(
        {UserPermission.granted_by_id: None}
    )
    db.query(UserPermission).filter(UserPermission.user_id == user.id).delete()
    db.delete(user)
    db.commit()
    return None
