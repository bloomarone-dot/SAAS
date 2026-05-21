from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import assert_permission, get_current_user, require_tenant_user
from app.modules.restaurants.models import Restaurant
from app.modules.restaurants.schemas import (
    RestaurantProvisionIn,
    RestaurantProvisionOut,
    RestaurantPublic,
    RestaurantSettingsIn,
)
from app.modules.permissions.models import Permission, Role
from app.modules.users.models import User
from app.security import hash_password


router = APIRouter(prefix="/restaurants", tags=["restaurants"])
LOGO_UPLOAD_DIR = Path("uploads/logos")
ALLOWED_LOGO_TYPES = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/svg+xml": ".svg"}


@router.get("", response_model=list[RestaurantPublic])
def list_restaurants(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Liste tous les restaurants pour le super administrateur."""
    if current_user.role != Role.SUPERADMIN:
        raise HTTPException(status_code=403, detail="Seul un super administrateur peut lister les restaurants")

    return db.query(Restaurant).order_by(Restaurant.created_at.desc()).all()


@router.post("", response_model=RestaurantProvisionOut, status_code=status.HTTP_201_CREATED)
def provision_restaurant(
    payload: RestaurantProvisionIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Cree un restaurant et son administrateur proprietaire."""
    if current_user.role != Role.SUPERADMIN:
        raise HTTPException(status_code=403, detail="Seul un super administrateur peut creer un restaurant")

    email = payload.owner_email.lower().strip()
    username = payload.owner_username.lower().strip()

    existing_restaurant = db.query(Restaurant).filter(Restaurant.slug == payload.slug).one_or_none()
    if existing_restaurant:
        raise HTTPException(status_code=409, detail="Ce slug restaurant est deja utilise")

    existing_user = (
        db.query(User)
        .filter(or_(User.email == email, User.username == username))
        .one_or_none()
    )
    if existing_user:
        raise HTTPException(status_code=409, detail="Email ou nom utilisateur deja utilise")

    restaurant = Restaurant(
        name=payload.name,
        slug=payload.slug,
        logo_url=payload.logo_url,
        primary_color=payload.primary_color,
        secondary_color=payload.secondary_color,
        currency=payload.currency.upper(),
        timezone=payload.timezone,
    )
    db.add(restaurant)
    db.flush()

    owner = User(
        email=email,
        username=username,
        password_hash=hash_password(payload.owner_password),
        first_name=payload.owner_first_name,
        last_name=payload.owner_last_name,
        phone=payload.owner_phone,
        role=Role.ADMIN,
        restaurant_id=restaurant.id,
        is_owner=True,
    )
    db.add(owner)
    db.flush()

    restaurant.owner_id = owner.id
    db.commit()
    db.refresh(restaurant)
    db.refresh(owner)

    return RestaurantProvisionOut(restaurant=restaurant, owner=owner)


@router.get("/me", response_model=RestaurantPublic)
def get_my_restaurant(current_user: User = Depends(require_tenant_user), db: Session = Depends(get_db)):
    """Retourne le restaurant du tenant courant."""
    assert_permission(current_user, Permission.RESTAURANT_SETTINGS_READ)
    restaurant = db.get(Restaurant, current_user.restaurant_id)
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant introuvable")
    return restaurant


@router.patch("/me/settings", response_model=RestaurantPublic)
def update_my_restaurant_settings(
    payload: RestaurantSettingsIn,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    """Met a jour les informations de personnalisation du restaurant."""
    assert_permission(current_user, Permission.RESTAURANT_SETTINGS_UPDATE)
    if not current_user.is_owner:
        raise HTTPException(status_code=403, detail="Seul le proprietaire peut configurer le restaurant")

    restaurant = db.get(Restaurant, current_user.restaurant_id)
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant introuvable")

    for field, value in payload.dict(exclude_unset=True).items():
        if field == "currency" and value:
            value = value.upper()
        setattr(restaurant, field, value)

    db.commit()
    db.refresh(restaurant)
    return restaurant


@router.post("/me/logo", response_model=RestaurantPublic)
async def upload_my_restaurant_logo(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    """Importe un logo et met a jour l'URL du logo du restaurant."""
    assert_permission(current_user, Permission.RESTAURANT_SETTINGS_UPDATE)
    if not current_user.is_owner:
        raise HTTPException(status_code=403, detail="Seul le proprietaire peut configurer le restaurant")

    extension = ALLOWED_LOGO_TYPES.get(file.content_type or "")
    if not extension:
        raise HTTPException(status_code=400, detail="Format logo invalide. Utilisez PNG, JPG, WEBP ou SVG.")

    content = await file.read()
    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Logo trop volumineux. Taille maximale: 2 Mo.")

    restaurant = db.get(Restaurant, current_user.restaurant_id)
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant introuvable")

    LOGO_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{restaurant.id}-{uuid4().hex}{extension}"
    destination = LOGO_UPLOAD_DIR / filename
    destination.write_bytes(content)

    restaurant.logo_url = str(request.url_for("uploads", path=f"logos/{filename}"))
    db.commit()
    db.refresh(restaurant)
    return restaurant
