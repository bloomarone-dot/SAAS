import os
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import assert_permission, has_permission, require_tenant_user
from app.modules.audit.service import log_action
from app.modules.menu.models import CategoryModel, DishModel
from app.modules.menu.schemas import CategoryCreate, CategoryResponse, DishCreate, DishResponse, DishUpdate, PublicRestaurantMenu
from app.modules.menu.services import MenuService
from app.modules.permissions.models import Permission
from app.modules.restaurants.models import Restaurant
from app.modules.users.models import User
from app.security import detect_image_extension

router = APIRouter(prefix="/menu", tags=["menu"])
MENU_UPLOAD_DIR = Path(os.getenv("UPLOADS_DIR", "uploads")) / "menu"
ALLOWED_MENU_IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp"}


def assert_any_permission(user: User, permissions: tuple[Permission, ...]) -> None:
    if not any(has_permission(user, permission) for permission in permissions):
        required = ", ".join(permission.value for permission in permissions)
        raise HTTPException(status_code=403, detail=f"Permission requise: {required}")


def assert_menu_read_allowed(user: User) -> None:
    assert_any_permission(user, (
        Permission.RESTAURANT_SETTINGS_READ,
        Permission.KITCHEN_READ,
        Permission.SERVICE_READ,
        Permission.STOCK_READ,
    ))


def assert_menu_update_allowed(user: User) -> None:
    assert_any_permission(user, (
        Permission.RESTAURANT_SETTINGS_UPDATE,
        Permission.KITCHEN_UPDATE,
        Permission.STOCK_UPDATE,
    ))


@router.post("/images")
async def upload_menu_image(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(require_tenant_user),
):
    assert_menu_update_allowed(current_user)
    if (file.content_type or "") not in ALLOWED_MENU_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Format image invalide. Utilisez PNG, JPG ou WEBP.")

    content = await file.read()
    if len(content) > 3 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image trop volumineuse. Taille maximale: 3 Mo.")
    extension = detect_image_extension(content)
    if not extension:
        raise HTTPException(status_code=400, detail="Fichier image invalide ou corrompu.")

    filename = f"{current_user.restaurant_id}-{uuid4().hex}{extension}"
    destination = MENU_UPLOAD_DIR / filename
    try:
        MENU_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(content)
    except OSError as exc:
        raise HTTPException(status_code=500, detail="Stockage image indisponible. Vérifiez les permissions du dossier uploads/menu.") from exc
    return {"image_url": f"/uploads/menu/{filename}"}


@router.get("/public/{slug}", response_model=PublicRestaurantMenu)
def get_public_menu(slug: str, db: Session = Depends(get_db)):
    tenant_key = slug.strip().lower()
    restaurant = (
        db.query(Restaurant)
        .filter(
            Restaurant.is_active.is_(True),
            or_(
                func.lower(Restaurant.slug) == tenant_key,
                func.lower(Restaurant.subdomain) == tenant_key,
                func.replace(func.lower(Restaurant.slug), "-", "") == tenant_key,
            ),
        )
        .one_or_none()
    )
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant indisponible")

    categories = (
        db.query(CategoryModel)
        .filter(CategoryModel.restaurant_id == restaurant.id, CategoryModel.is_active.is_(True))
        .order_by(CategoryModel.created_at.desc())
        .all()
    )
    dishes = (
        db.query(DishModel)
        .filter(DishModel.restaurant_id == restaurant.id, DishModel.is_available.is_(True))
        .order_by(DishModel.created_at.desc())
        .all()
    )
    return PublicRestaurantMenu(
        restaurant={
            "id": restaurant.id,
            "name": restaurant.name,
            "slug": restaurant.slug,
            "subdomain": restaurant.subdomain,
            "custom_domain": restaurant.custom_domain,
            "logo_url": restaurant.logo_url,
            "cover_image_url": restaurant.cover_image_url,
            "description": restaurant.description,
            "phone": restaurant.phone,
            "whatsapp_phone": restaurant.whatsapp_phone,
            "email": restaurant.email,
            "address": restaurant.address,
            "city": restaurant.city,
            "country": restaurant.country,
            "opening_hours": restaurant.opening_hours,
            "is_open": restaurant.is_open,
            "payment_methods": restaurant.payment_methods,
            "delivery_fee": restaurant.delivery_fee,
            "currency": restaurant.currency,
            "primary_color": restaurant.primary_color,
            "secondary_color": restaurant.secondary_color,
            "accent_color": restaurant.accent_color,
            "background_color": restaurant.background_color,
            "text_color": restaurant.text_color,
            "button_color": restaurant.button_color,
            "is_active": restaurant.is_active,
        },
        categories=categories,
        dishes=dishes,
    )


@router.post("/categories", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
def create_new_category(
    category: CategoryCreate,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_menu_update_allowed(current_user)
    created = MenuService.create_category(
        db=db,
        restaurant_id=current_user.restaurant_id,
        category_data=category,
    )
    log_action(
        db,
        current_user,
        "menu.category_create",
        "menu_category",
        created.id,
        f"Creation categorie carte {created.name}",
        {"name": created.name},
    )
    db.commit()
    return created


@router.get("/categories/restaurant/{restaurant_id}", response_model=list[CategoryResponse])
def get_restaurant_categories(
    restaurant_id: str,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_menu_read_allowed(current_user)
    if restaurant_id != current_user.restaurant_id:
        raise HTTPException(status_code=403, detail="Restaurant non autorise")
    return MenuService.get_categories_by_restaurant(db=db, restaurant_id=current_user.restaurant_id)


@router.delete("/categories/{category_id}", status_code=status.HTTP_200_OK)
def delete_category(
    category_id: str,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_menu_update_allowed(current_user)
    category = db.get(CategoryModel, category_id)
    category_name = category.name if category else None
    success = MenuService.delete_category(
        db=db,
        restaurant_id=current_user.restaurant_id,
        category_id=category_id,
    )
    if not success:
        raise HTTPException(status_code=404, detail="Categorie non trouvee")
    log_action(
        db,
        current_user,
        "menu.category_delete",
        "menu_category",
        category_id,
        f"Suppression categorie carte {category_name or category_id}",
        {"name": category_name},
    )
    db.commit()
    return {"message": "Categorie supprimee avec succes"}


@router.post("/dishes", response_model=DishResponse, status_code=status.HTTP_201_CREATED)
def create_new_dish(
    dish: DishCreate,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_menu_update_allowed(current_user)
    created = MenuService.create_dish(
        db=db,
        restaurant_id=current_user.restaurant_id,
        dish_data=dish,
    )
    if not created:
        raise HTTPException(status_code=400, detail="Categorie invalide pour ce restaurant")
    log_action(
        db,
        current_user,
        "menu.dish_create",
        "menu_dish",
        created.id,
        f"Creation plat carte {created.name}",
        {"name": created.name, "price": created.price, "category_id": created.category_id},
    )
    db.commit()
    return created


@router.get("/categories/{category_id}/dishes", response_model=list[DishResponse])
def get_category_dishes(
    category_id: str,
    include_unavailable: bool = True,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_menu_read_allowed(current_user)
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
    assert_menu_update_allowed(current_user)
    updated_dish = MenuService.update_dish(
        db=db,
        restaurant_id=current_user.restaurant_id,
        dish_id=dish_id,
        dish_data=dish_updates,
    )
    if not updated_dish:
        raise HTTPException(status_code=404, detail="Plat introuvable")
    log_action(
        db,
        current_user,
        "menu.dish_update",
        "menu_dish",
        updated_dish.id,
        f"Modification plat carte {updated_dish.name}",
        {"name": updated_dish.name, "price": updated_dish.price, "is_available": updated_dish.is_available},
    )
    db.commit()
    return updated_dish


@router.patch("/dishes/{dish_id}/toggle-availability", response_model=DishResponse)
def toggle_dish_status(
    dish_id: str,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_menu_update_allowed(current_user)
    updated_dish = MenuService.toggle_dish_availability(
        db=db,
        restaurant_id=current_user.restaurant_id,
        dish_id=dish_id,
    )
    if not updated_dish:
        raise HTTPException(status_code=404, detail="Plat introuvable")
    log_action(
        db,
        current_user,
        "menu.dish_availability",
        "menu_dish",
        updated_dish.id,
        f"Disponibilite plat carte {updated_dish.name}: {'disponible' if updated_dish.is_available else 'indisponible'}",
        {"name": updated_dish.name, "is_available": updated_dish.is_available},
    )
    db.commit()
    return updated_dish


@router.delete("/dishes/{dish_id}", status_code=status.HTTP_200_OK)
def delete_dish(
    dish_id: str,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_menu_update_allowed(current_user)
    dish = db.get(DishModel, dish_id)
    dish_name = dish.name if dish else None
    success = MenuService.delete_dish(
        db=db,
        restaurant_id=current_user.restaurant_id,
        dish_id=dish_id,
    )
    if not success:
        raise HTTPException(status_code=404, detail="Plat introuvable")
    log_action(
        db,
        current_user,
        "menu.dish_delete",
        "menu_dish",
        dish_id,
        f"Suppression plat carte {dish_name or dish_id}",
        {"name": dish_name},
    )
    db.commit()
    return {"message": "Le plat a ete retire du menu avec succes"}
