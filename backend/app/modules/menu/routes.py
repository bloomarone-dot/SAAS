from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import assert_permission, has_permission, require_tenant_user
from app.modules.menu.schemas import CategoryCreate, CategoryResponse, DishCreate, DishResponse, DishUpdate
from app.modules.menu.services import MenuService
from app.modules.permissions.models import Permission
from app.modules.users.models import User

router = APIRouter(prefix="/menu", tags=["menu"])
MENU_UPLOAD_DIR = Path("uploads/menu")
ALLOWED_MENU_IMAGE_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
}


def assert_any_permission(user: User, permissions: tuple[Permission, ...]) -> None:
    if not any(has_permission(user, permission) for permission in permissions):
        required = ", ".join(permission.value for permission in permissions)
        raise HTTPException(status_code=403, detail=f"Permission requise: {required}")


@router.post("/images")
async def upload_menu_image(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(require_tenant_user),
):
    assert_any_permission(current_user, (Permission.RESTAURANT_SETTINGS_UPDATE, Permission.KITCHEN_UPDATE))
    extension = ALLOWED_MENU_IMAGE_TYPES.get(file.content_type or "")
    if not extension:
        raise HTTPException(status_code=400, detail="Format image invalide. Utilisez PNG, JPG, WEBP ou SVG.")

    content = await file.read()
    if len(content) > 3 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image trop volumineuse. Taille maximale: 3 Mo.")

    MENU_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{current_user.restaurant_id}-{uuid4().hex}{extension}"
    destination = MENU_UPLOAD_DIR / filename
    destination.write_bytes(content)
    return {"image_url": str(request.url_for("uploads", path=f"menu/{filename}"))}


@router.post("/categories", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
def create_new_category(
    category: CategoryCreate,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_any_permission(current_user, (Permission.RESTAURANT_SETTINGS_UPDATE, Permission.KITCHEN_UPDATE))
    return MenuService.create_category(
        db=db,
        restaurant_id=current_user.restaurant_id,
        category_data=category,
    )


@router.get("/categories/restaurant/{restaurant_id}", response_model=list[CategoryResponse])
def get_restaurant_categories(
    restaurant_id: str,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_any_permission(current_user, (Permission.RESTAURANT_SETTINGS_READ, Permission.KITCHEN_READ))
    if restaurant_id != current_user.restaurant_id:
        raise HTTPException(status_code=403, detail="Restaurant non autorise")
    return MenuService.get_categories_by_restaurant(db=db, restaurant_id=current_user.restaurant_id)


@router.delete("/categories/{category_id}", status_code=status.HTTP_200_OK)
def delete_category(
    category_id: str,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_permission(current_user, Permission.RESTAURANT_SETTINGS_UPDATE)
    success = MenuService.delete_category(
        db=db,
        restaurant_id=current_user.restaurant_id,
        category_id=category_id,
    )
    if not success:
        raise HTTPException(status_code=404, detail="Categorie non trouvee")
    return {"message": "Categorie supprimee avec succes"}


@router.post("/dishes", response_model=DishResponse, status_code=status.HTTP_201_CREATED)
def create_new_dish(
    dish: DishCreate,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_any_permission(current_user, (Permission.RESTAURANT_SETTINGS_UPDATE, Permission.KITCHEN_UPDATE))
    created = MenuService.create_dish(
        db=db,
        restaurant_id=current_user.restaurant_id,
        dish_data=dish,
    )
    if not created:
        raise HTTPException(status_code=400, detail="Categorie invalide pour ce restaurant")
    return created


@router.get("/categories/{category_id}/dishes", response_model=list[DishResponse])
def get_category_dishes(
    category_id: str,
    include_unavailable: bool = True,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_any_permission(current_user, (Permission.RESTAURANT_SETTINGS_READ, Permission.KITCHEN_READ))
    if not MenuService.category_belongs_to_restaurant(db, current_user.restaurant_id, category_id):
        raise HTTPException(status_code=404, detail="Categorie introuvable")
    return MenuService.get_dishes_by_category(
        db=db,
        restaurant_id=current_user.restaurant_id,
        category_id=category_id,
        include_unavailable=include_unavailable,
    )


@router.put("/dishes/{dish_id}", response_model=DishResponse)
def update_dish_info(
    dish_id: str,
    dish_updates: DishUpdate,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_permission(current_user, Permission.RESTAURANT_SETTINGS_UPDATE)
    updated_dish = MenuService.update_dish(
        db=db,
        restaurant_id=current_user.restaurant_id,
        dish_id=dish_id,
        dish_data=dish_updates,
    )
    if not updated_dish:
        raise HTTPException(status_code=404, detail="Plat introuvable")
    return updated_dish


@router.patch("/dishes/{dish_id}/toggle-availability", response_model=DishResponse)
def toggle_dish_status(
    dish_id: str,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_any_permission(current_user, (Permission.RESTAURANT_SETTINGS_UPDATE, Permission.KITCHEN_UPDATE))
    updated_dish = MenuService.toggle_dish_availability(
        db=db,
        restaurant_id=current_user.restaurant_id,
        dish_id=dish_id,
    )
    if not updated_dish:
        raise HTTPException(status_code=404, detail="Plat introuvable")
    return updated_dish


@router.delete("/dishes/{dish_id}", status_code=status.HTTP_200_OK)
def delete_dish(
    dish_id: str,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_permission(current_user, Permission.RESTAURANT_SETTINGS_UPDATE)
    success = MenuService.delete_dish(
        db=db,
        restaurant_id=current_user.restaurant_id,
        dish_id=dish_id,
    )
    if not success:
        raise HTTPException(status_code=404, detail="Plat introuvable")
    return {"message": "Le plat a ete retire du menu avec succes"}
