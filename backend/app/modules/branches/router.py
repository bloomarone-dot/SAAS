from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import assert_permission, has_permission, require_tenant_user
from app.modules.audit.service import log_action
from app.modules.branches.extended_schemas import (
    BranchDetailPublic,
    BranchUpdateIn,
    DeliveryAreaCreateIn,
    DeliveryAreaPublic,
    DeliveryAreaUpdateIn,
)
from app.modules.branches.models import Branch, DeliveryArea
from app.modules.branches.delivery_area_seed import ensure_yaounde_delivery_areas
from app.modules.branches.schemas import BranchCreateIn, BranchPublic
from app.modules.finance.models import CashRegister
from app.modules.permissions.models import Permission, Role
from app.modules.users.models import User
from app.tenancy import tenant_get_or_404


router = APIRouter(prefix="/branches", tags=["branches"])


@router.get("", response_model=list[BranchDetailPublic])
def list_branches(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    """Liste les branches du restaurant courant."""
    assert_permission(current_user, Permission.BRANCH_READ)
    branches = (
        db.query(Branch)
        .filter(Branch.restaurant_id == current_user.restaurant_id)
        .order_by(Branch.created_at.desc())
        .all()
    )
    return enrich_branches(db, branches, current_user.restaurant_id)


@router.post("", response_model=BranchDetailPublic, status_code=201)
def create_branch(
    payload: BranchCreateIn,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    """Cree une branche dans le restaurant de l'utilisateur courant."""
    assert_permission(current_user, Permission.BRANCH_CREATE)
    validate_manager(db, payload.manager_id, current_user.restaurant_id)
    branch = Branch(
        restaurant_id=current_user.restaurant_id,
        name=payload.name,
        city=payload.city,
        address=payload.address,
        phone=payload.phone,
        manager_id=payload.manager_id,
    )
    db.add(branch)
    db.flush()
    if payload.manager_id:
        manager = tenant_get_or_404(
            db,
            User,
            payload.manager_id,
            current_user.restaurant_id,
            detail="Responsable de branche invalide",
        )
        if not manager.branch_id:
            manager.branch_id = branch.id
    log_action(db, current_user, "branch.create", "branch", branch.id, f"Création branche {branch.name}", {"city": branch.city})
    db.commit()
    db.refresh(branch)
    return enrich_branches(db, [branch], current_user.restaurant_id)[0]


@router.get("/detail/{branch_id}", response_model=BranchDetailPublic)
def get_branch(branch_id: str, current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.BRANCH_READ)
    branch = get_branch_or_404(db, current_user.restaurant_id, branch_id)
    return enrich_branches(db, [branch], current_user.restaurant_id)[0]


@router.patch("/detail/{branch_id}", response_model=BranchDetailPublic)
def update_branch(
    branch_id: str,
    payload: BranchUpdateIn,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_permission(current_user, Permission.BRANCH_CREATE)
    branch = get_branch_or_404(db, current_user.restaurant_id, branch_id)
    fields_set = getattr(payload, "model_fields_set", None) or payload.__fields_set__
    if "manager_id" in fields_set:
        validate_manager(db, payload.manager_id, current_user.restaurant_id)
    for field in ("name", "city", "address", "phone", "manager_id", "is_active"):
        if field in fields_set:
            setattr(branch, field, getattr(payload, field))
    log_action(db, current_user, "branch.update", "branch", branch.id, f"Modification branche {branch.name}", {"fields": sorted(fields_set)})
    db.commit()
    db.refresh(branch)
    return enrich_branches(db, [branch], current_user.restaurant_id)[0]


@router.get("/delivery-areas", response_model=list[DeliveryAreaPublic])
def list_delivery_areas(
    branch_id: str | None = Query(default=None),
    active_only: bool = Query(default=False),
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    if not has_permission(current_user, Permission.RESTAURANT_SETTINGS_READ):
        assert_permission(current_user, Permission.CASHIER_READ)
    ensure_yaounde_delivery_areas(db, current_user.restaurant_id)
    query = db.query(DeliveryArea).filter(DeliveryArea.restaurant_id == current_user.restaurant_id)
    if branch_id:
        query = query.filter(DeliveryArea.branch_id == branch_id)
    if active_only:
        query = query.filter(DeliveryArea.is_active.is_(True))
    areas = query.order_by(DeliveryArea.name.asc()).all()
    return enrich_delivery_areas(db, areas)


@router.post("/delivery-areas", response_model=DeliveryAreaPublic, status_code=201)
def create_delivery_area(
    payload: DeliveryAreaCreateIn,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_permission(current_user, Permission.RESTAURANT_SETTINGS_UPDATE)
    validate_branch_scope(db, current_user.restaurant_id, payload.branch_id)
    area = DeliveryArea(
        restaurant_id=current_user.restaurant_id,
        branch_id=payload.branch_id,
        name=payload.name.strip(),
        delivery_fee=payload.delivery_fee,
        average_delivery_minutes=payload.average_delivery_minutes,
        is_active=payload.is_active,
    )
    db.add(area)
    log_action(db, current_user, "delivery_area.create", "delivery_area", area.id, f"Création quartier {area.name}", {"delivery_fee": area.delivery_fee, "branch_id": area.branch_id})
    db.commit()
    db.refresh(area)
    return enrich_delivery_areas(db, [area])[0]


@router.patch("/delivery-areas/{area_id}", response_model=DeliveryAreaPublic)
def update_delivery_area(
    area_id: str,
    payload: DeliveryAreaUpdateIn,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_permission(current_user, Permission.RESTAURANT_SETTINGS_UPDATE)
    area = get_delivery_area_or_404(db, current_user.restaurant_id, area_id)
    fields_set = getattr(payload, "model_fields_set", None) or payload.__fields_set__
    if "branch_id" in fields_set:
        validate_branch_scope(db, current_user.restaurant_id, payload.branch_id)
    for field in ("name", "delivery_fee", "branch_id", "average_delivery_minutes", "is_active"):
        if field in fields_set:
            value = getattr(payload, field)
            if field == "name" and isinstance(value, str):
                value = value.strip()
            setattr(area, field, value)
    log_action(db, current_user, "delivery_area.update", "delivery_area", area.id, f"Modification quartier {area.name}", {"fields": sorted(fields_set), "delivery_fee": area.delivery_fee})
    db.commit()
    db.refresh(area)
    return enrich_delivery_areas(db, [area])[0]


def get_branch_or_404(db: Session, restaurant_id: str, branch_id: str) -> Branch:
    return tenant_get_or_404(db, Branch, branch_id, restaurant_id, detail="Branche introuvable")


def get_delivery_area_or_404(db: Session, restaurant_id: str, area_id: str) -> DeliveryArea:
    return tenant_get_or_404(db, DeliveryArea, area_id, restaurant_id, detail="Quartier introuvable")


def validate_branch_scope(db: Session, restaurant_id: str, branch_id: str | None) -> None:
    if branch_id is None:
        return
    get_branch_or_404(db, restaurant_id, branch_id)


def validate_manager(db: Session, manager_id: str | None, restaurant_id: str) -> None:
    if not manager_id:
        return
    manager = tenant_get_or_404(
        db,
        User,
        manager_id,
        restaurant_id,
        detail="Responsable de branche invalide",
    )
    if manager.role not in {Role.ADMIN, Role.MANAGER}:
        raise HTTPException(status_code=400, detail="Le responsable doit être un manager ou administrateur")


def enrich_branches(db: Session, branches: list[Branch], restaurant_id: str) -> list[Branch]:
    branch_ids = [branch.id for branch in branches]
    manager_ids = [branch.manager_id for branch in branches if branch.manager_id]
    users_count = dict(
        db.query(User.branch_id, func.count(User.id))
        .filter(User.restaurant_id == restaurant_id, User.branch_id.in_(branch_ids))
        .group_by(User.branch_id)
        .all()
    ) if branch_ids else {}
    registers_count = dict(
        db.query(User.branch_id, func.count(CashRegister.id))
        .join(User, User.id == CashRegister.responsible_user_id)
        .filter(CashRegister.restaurant_id == restaurant_id, User.branch_id.in_(branch_ids))
        .group_by(User.branch_id)
        .all()
    ) if branch_ids else {}
    managers = {
        user.branch_id: f"{user.first_name} {user.last_name}".strip() or user.username
        for user in db.query(User)
        .filter(User.restaurant_id == restaurant_id, User.branch_id.in_(branch_ids), User.role.in_([Role.ADMIN, Role.MANAGER]))
        .order_by(User.created_at.asc())
        .all()
    } if branch_ids else {}
    named_managers = {
        user.id: f"{user.first_name} {user.last_name}".strip() or user.username
        for user in db.query(User).filter(User.restaurant_id == restaurant_id, User.id.in_(manager_ids)).all()
    } if manager_ids else {}
    for branch in branches:
        branch.users_count = int(users_count.get(branch.id, 0))
        branch.cash_registers_count = int(registers_count.get(branch.id, 0))
        branch.manager_name = named_managers.get(branch.manager_id) or managers.get(branch.id)
    return branches


def enrich_delivery_areas(db: Session, areas: list[DeliveryArea]) -> list[DeliveryArea]:
    branch_ids = {area.branch_id for area in areas if area.branch_id}
    names = {
        branch.id: branch.name
        for branch in db.query(Branch).filter(Branch.id.in_(branch_ids)).all()
    } if branch_ids else {}
    for area in areas:
        area.branch_name = names.get(area.branch_id)
    return areas
