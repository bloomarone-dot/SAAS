from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import assert_permission, require_tenant_user
from app.modules.audit.service import log_action
from app.modules.branches.models import Branch
from app.modules.branches.schemas import BranchCreateIn, BranchPublic
from app.modules.permissions.models import Permission
from app.modules.users.models import User


router = APIRouter(prefix="/branches", tags=["branches"])


@router.get("", response_model=list[BranchPublic])
def list_branches(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    """Liste les branches du restaurant courant."""
    assert_permission(current_user, Permission.BRANCH_READ)
    return (
        db.query(Branch)
        .filter(Branch.restaurant_id == current_user.restaurant_id)
        .order_by(Branch.created_at.desc())
        .all()
    )


@router.post("", response_model=BranchPublic, status_code=201)
def create_branch(
    payload: BranchCreateIn,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    """Cree une branche dans le restaurant de l'utilisateur courant."""
    assert_permission(current_user, Permission.BRANCH_CREATE)
    branch = Branch(
        restaurant_id=current_user.restaurant_id,
        name=payload.name,
        city=payload.city,
        address=payload.address,
        phone=payload.phone,
    )
    db.add(branch)
    log_action(db, current_user, "branch.create", "branch", branch.id, f"Création branche {branch.name}", {"city": branch.city})
    db.commit()
    db.refresh(branch)
    return branch
