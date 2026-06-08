import re
from pathlib import Path
from uuid import uuid4

import unicodedata

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import assert_permission, get_current_user, require_tenant_user
from app.modules.branches.models import Branch
from app.modules.restaurants.models import Restaurant
from app.modules.restaurants.schemas import (
    RestaurantDetailPublic,
    RestaurantProvisionIn,
    RestaurantProvisionOut,
    RestaurantPublic,
    RestaurantSettingsIn,
    RestaurantStatusIn,
)
from app.modules.platform.models import RestaurantSubscription
from app.modules.permissions.models import Permission, Role
from app.modules.users.models import User
from app.security import detect_image_extension, hash_password


router = APIRouter(prefix="/restaurants", tags=["restaurants"])
LOGO_UPLOAD_DIR = Path("uploads/logos")
ALLOWED_LOGO_TYPES = {"image/png", "image/jpeg", "image/webp"}


def generate_slug(name: str) -> str:
    """Generate a URL-friendly slug from a restaurant name."""
    slug = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    slug = slug.lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    slug = re.sub(r"-{2,}", "-", slug)
    slug = slug.strip("-")
    return slug or str(uuid4().hex[:8])


@router.get("", response_model=list[RestaurantPublic])
def list_restaurants(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Liste tous les restaurants pour le super administrateur."""
    if current_user.role != Role.SUPERADMIN:
        raise HTTPException(status_code=403, detail="Seul un super administrateur peut lister les restaurants")

    branch_counts = dict(
        db.query(Branch.restaurant_id, func.count(Branch.id))
        .group_by(Branch.restaurant_id)
        .all()
    )
    restaurants = db.query(Restaurant).order_by(Restaurant.created_at.desc()).all()
    for restaurant in restaurants:
        restaurant.branches_count = max(1, branch_counts.get(restaurant.id, 0))
    return restaurants


@router.post("", response_model=RestaurantProvisionOut, status_code=status.HTTP_201_CREATED)
def provision_restaurant(
    payload: RestaurantProvisionIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Cree un restaurant et son administrateur proprietaire."""
    if current_user.role != Role.SUPERADMIN:
        raise HTTPException(status_code=403, detail="Seul un super administrateur peut creer un restaurant")

    email = payload.owner_email.lower().strip() if payload.owner_email else None
    username = payload.owner_username.lower().strip()

    slug = payload.slug or generate_slug(payload.name)
    original_slug = slug
    counter = 1
    while db.query(Restaurant).filter(Restaurant.slug == slug).one_or_none():
        slug = f"{original_slug}-{counter}"
        counter += 1

    user_filters = [User.username == username]
    if email:
        user_filters.append(User.email == email)
    existing_user = db.query(User).filter(or_(*user_filters)).one_or_none()
    if existing_user:
        raise HTTPException(status_code=409, detail="Email ou nom utilisateur deja utilise")

    restaurant = Restaurant(
        name=payload.name,
        slug=slug,
        logo_url=payload.logo_url,
        primary_color=payload.primary_color,
        secondary_color=payload.secondary_color,
        currency=payload.currency.upper(),
        timezone=payload.timezone,
        phone=payload.owner_phone,
        whatsapp_phone=payload.owner_alt_phone,
        email=email,
    )
    db.add(restaurant)
    db.flush()

    main_branch = Branch(
        restaurant_id=restaurant.id,
        name="Siège",
        city="Ville à renseigner",
        address="Adresse principale à renseigner",
        phone=payload.owner_phone,
    )
    db.add(main_branch)
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
        branch_id=main_branch.id,
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
    restaurant.branches_count = max(
        1,
        db.query(Branch).filter(Branch.restaurant_id == restaurant.id).count(),
    )
    return restaurant


@router.get("/{restaurant_id}", response_model=RestaurantDetailPublic)
def get_restaurant_detail(
    restaurant_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retourne les donnees reelles d'un restaurant pour le superadmin."""
    if current_user.role != Role.SUPERADMIN:
        raise HTTPException(status_code=403, detail="Seul un super administrateur peut consulter ce restaurant")

    restaurant = db.get(Restaurant, restaurant_id)
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant introuvable")

    restaurant.branches_count = max(
        1,
        db.query(Branch).filter(Branch.restaurant_id == restaurant.id).count(),
    )
    subscription = (
        db.query(RestaurantSubscription)
        .filter(RestaurantSubscription.restaurant_id == restaurant.id)
        .one_or_none()
    )
    return RestaurantDetailPublic(
        restaurant=restaurant,
        owner=restaurant.owner,
        subscription={
            "plan": subscription.plan,
            "amount": subscription.amount,
            "currency": subscription.currency,
            "status": subscription.status,
            "renewal_date": subscription.renewal_date,
            "notes": subscription.notes,
        }
        if subscription
        else None,
    )


@router.patch("/{restaurant_id}/status", response_model=RestaurantPublic)
def update_restaurant_status(
    restaurant_id: str,
    payload: RestaurantStatusIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Active ou suspend un tenant restaurant."""
    if current_user.role != Role.SUPERADMIN:
        raise HTTPException(status_code=403, detail="Seul un super administrateur peut modifier ce statut")

    restaurant = db.get(Restaurant, restaurant_id)
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant introuvable")

    restaurant.is_active = payload.is_active
    subscription = (
        db.query(RestaurantSubscription)
        .filter(RestaurantSubscription.restaurant_id == restaurant.id)
        .one_or_none()
    )
    if subscription and not payload.is_active:
        subscription.status = "Suspendu"
    db.commit()
    db.refresh(restaurant)
    restaurant.branches_count = max(
        1,
        db.query(Branch).filter(Branch.restaurant_id == restaurant.id).count(),
    )
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
    restaurant.branches_count = max(
        1,
        db.query(Branch).filter(Branch.restaurant_id == restaurant.id).count(),
    )
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

    if (file.content_type or "") not in ALLOWED_LOGO_TYPES:
        raise HTTPException(status_code=400, detail="Format logo invalide. Utilisez PNG, JPG ou WEBP.")

    content = await file.read()
    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Logo trop volumineux. Taille maximale: 2 Mo.")
    extension = detect_image_extension(content)
    if not extension:
        raise HTTPException(status_code=400, detail="Fichier logo invalide ou corrompu.")

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
    restaurant.branches_count = max(
        1,
        db.query(Branch).filter(Branch.restaurant_id == restaurant.id).count(),
    )
    return restaurant
