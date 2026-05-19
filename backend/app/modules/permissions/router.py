from fastapi import APIRouter, Depends

from app.dependencies import assert_permission, require_tenant_user
from app.modules.permissions.models import Permission
from app.modules.permissions.schemas import PermissionGroupPublic, PermissionPublic, RolePresetPublic
from app.modules.permissions.service import get_permission_groups, get_permissions, get_role_presets
from app.modules.users.models import User


router = APIRouter(prefix="/permissions", tags=["permissions"])


@router.get("", response_model=list[PermissionPublic])
def list_available_permissions(current_user: User = Depends(require_tenant_user)):
    """Expose le catalogue plat des permissions attribuables."""
    assert_permission(current_user, Permission.USER_PERMISSIONS_UPDATE)
    return get_permissions()


@router.get("/groups", response_model=list[PermissionGroupPublic])
def list_permission_groups(current_user: User = Depends(require_tenant_user)):
    """Expose le catalogue groupe par module fonctionnel."""
    assert_permission(current_user, Permission.USER_PERMISSIONS_UPDATE)
    return get_permission_groups()


@router.get("/role-presets", response_model=list[RolePresetPublic])
def list_role_presets(current_user: User = Depends(require_tenant_user)):
    """Expose les droits par defaut de chaque role operationnel."""
    assert_permission(current_user, Permission.USER_READ)
    return get_role_presets()

