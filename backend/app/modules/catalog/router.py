from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import assert_permission, require_tenant_user
from app.modules.catalog.classification import classify_sale_channel
from app.modules.audit.service import log_action
from app.modules.catalog.models import MenuCategory, MenuItem
from app.modules.catalog.schemas import (
    MenuCategoryIn,
    MenuCategoryPublic,
    MenuCategoryUpdateIn,
    MenuItemIn,
    MenuItemPublic,
    MenuItemUpdateIn,
)
from app.modules.permissions.models import Permission
from app.modules.users.models import User

router = APIRouter(prefix="/catalog", tags=["catalog"])


def validate_category(db: Session, category_id: str | None, restaurant_id: str | None) -> None:
    if not category_id:
        return
    category = db.get(MenuCategory, category_id)
    if not category or category.restaurant_id != restaurant_id:
        raise HTTPException(status_code=400, detail="Categorie invalide pour ce restaurant")


@router.get("/categories", response_model=list[MenuCategoryPublic])
def list_categories(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.RESTAURANT_SETTINGS_READ)
    return (
        db.query(MenuCategory)
        .filter(MenuCategory.restaurant_id == current_user.restaurant_id)
        .order_by(MenuCategory.created_at.desc())
        .all()
    )


@router.post("/categories", response_model=MenuCategoryPublic, status_code=201)
def create_category(
    payload: MenuCategoryIn,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_permission(current_user, Permission.RESTAURANT_SETTINGS_UPDATE)
    category = MenuCategory(restaurant_id=current_user.restaurant_id, **payload.dict())
    db.add(category)
    log_action(db, current_user, "catalog.category_create", "menu_category", category.id, f"Création catégorie carte {category.name}")
    db.commit()
    db.refresh(category)
    return category


@router.patch("/categories/{category_id}", response_model=MenuCategoryPublic)
def update_category(
    category_id: str,
    payload: MenuCategoryUpdateIn,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_permission(current_user, Permission.RESTAURANT_SETTINGS_UPDATE)
    category = db.get(MenuCategory, category_id)
    if not category or category.restaurant_id != current_user.restaurant_id:
        raise HTTPException(status_code=404, detail="Categorie introuvable")
    for field, value in payload.dict(exclude_unset=True).items():
        setattr(category, field, value)
    log_action(db, current_user, "catalog.category_update", "menu_category", category.id, f"Modification catégorie carte {category.name}")
    db.commit()
    db.refresh(category)
    return category


@router.delete("/categories/{category_id}", status_code=204)
def delete_category(
    category_id: str,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_permission(current_user, Permission.RESTAURANT_SETTINGS_UPDATE)
    category = db.get(MenuCategory, category_id)
    if not category or category.restaurant_id != current_user.restaurant_id:
        raise HTTPException(status_code=404, detail="Categorie introuvable")
    log_action(db, current_user, "catalog.category_delete", "menu_category", category.id, f"Suppression catégorie carte {category.name}")
    db.delete(category)
    db.commit()
    return None


@router.get("/items", response_model=list[MenuItemPublic])
def list_items(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    assert_permission(current_user, Permission.RESTAURANT_SETTINGS_READ)
    return (
        db.query(MenuItem)
        .filter(MenuItem.restaurant_id == current_user.restaurant_id)
        .order_by(MenuItem.created_at.desc())
        .all()
    )


@router.post("/items", response_model=MenuItemPublic, status_code=201)
def create_item(
    payload: MenuItemIn,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_permission(current_user, Permission.RESTAURANT_SETTINGS_UPDATE)
    validate_category(db, payload.category_id, current_user.restaurant_id)
    item = MenuItem(restaurant_id=current_user.restaurant_id, **payload.dict())
    category = db.get(MenuCategory, item.category_id) if item.category_id else None
    item.sale_channel = classify_sale_channel(
        item.name,
        item.description,
        category.name if category else None,
        category.description if category else None,
    )
    db.add(item)
    log_action(db, current_user, "catalog.item_create", "menu_item", item.id, f"Création plat vendable {item.name}", {"price": item.price})
    db.commit()
    db.refresh(item)
    return item


@router.patch("/items/{item_id}", response_model=MenuItemPublic)
def update_item(
    item_id: str,
    payload: MenuItemUpdateIn,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_permission(current_user, Permission.RESTAURANT_SETTINGS_UPDATE)
    item = db.get(MenuItem, item_id)
    if not item or item.restaurant_id != current_user.restaurant_id:
        raise HTTPException(status_code=404, detail="Plat introuvable")
    payload_data = payload.dict(exclude_unset=True)
    validate_category(db, payload_data.get("category_id"), current_user.restaurant_id)
    for field, value in payload_data.items():
        setattr(item, field, value)
    category = db.get(MenuCategory, item.category_id) if item.category_id else None
    item.sale_channel = classify_sale_channel(
        item.name,
        item.description,
        category.name if category else None,
        category.description if category else None,
    )
    log_action(db, current_user, "catalog.item_update", "menu_item", item.id, f"Modification plat vendable {item.name}", {"fields": sorted(payload_data)})
    db.commit()
    db.refresh(item)
    return item


@router.delete("/items/{item_id}", status_code=204)
def delete_item(
    item_id: str,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_permission(current_user, Permission.RESTAURANT_SETTINGS_UPDATE)
    item = db.get(MenuItem, item_id)
    if not item or item.restaurant_id != current_user.restaurant_id:
        raise HTTPException(status_code=404, detail="Plat introuvable")
    log_action(db, current_user, "catalog.item_delete", "menu_item", item.id, f"Suppression plat vendable {item.name}")
    db.delete(item)
    db.commit()
    return None
