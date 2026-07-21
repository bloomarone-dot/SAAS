from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import assert_permission, get_current_user, require_tenant_user
from app.modules.branches.models import Branch
from app.modules.restaurants.models import Restaurant
from app.modules.restaurants.schemas import (
    RestaurantBrandingPublic,
    RestaurantCommissionIn,
    RestaurantDetailPublic,
    RestaurantProvisionIn,
    RestaurantProvisionOut,
    RestaurantPublic,
    RestaurantSettingsIn,
    RestaurantStatusIn,
    TenantResolveOut,
)
from app.modules.menu.models import CategoryModel, DishModel
from app.modules.audit.service import log_action
from app.modules.platform.models import RestaurantSubscription
from app.modules.permissions.models import Permission, Role
from app.modules.users.models import User
from app.security import detect_image_extension, hash_password
from app.modules.restaurants.tenant_resolution import (
    BASE_DOMAIN,
    PLATFORM_HOSTS,
    RESERVED_SUBDOMAINS,
    clean_host,
    extract_subdomain,
    generate_slug,
    normalize_subdomain,
)


router = APIRouter(prefix="/restaurants", tags=["restaurants"])
public_router = APIRouter(prefix="/public", tags=["public"])
LOGO_UPLOAD_DIR = Path("uploads/logos")
ALLOWED_LOGO_TYPES = {"image/png", "image/jpeg", "image/webp"}
def public_restaurant_payload(restaurant: Restaurant) -> dict:
    return {
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
    }


def get_public_menu_payload(db: Session, restaurant: Restaurant) -> tuple[list[CategoryModel], list[DishModel]]:
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
    return categories, dishes


def public_category_payload(category: CategoryModel) -> dict:
    return {
        "id": category.id,
        "restaurant_id": category.restaurant_id,
        "name": category.name,
        "description": category.description,
        "image_url": category.image_url,
        "is_active": category.is_active,
        "created_at": category.created_at,
    }


def public_dish_payload(dish: DishModel) -> dict:
    return {
        "id": dish.id,
        "restaurant_id": dish.restaurant_id,
        "category_id": dish.category_id,
        "name": dish.name,
        "description": dish.description,
        "price": dish.price,
        "cost_per_dish": dish.cost_per_dish,
        "image_url": dish.image_url,
        "is_available": dish.is_available,
        "requires_kitchen": dish.requires_kitchen,
        "created_at": dish.created_at,
    }


def find_restaurant_by_tenant(db: Session, host: str, subdomain: str | None = None) -> Restaurant | None:
    custom_host = clean_host(host)
    if custom_host and not custom_host.endswith(f".{BASE_DOMAIN}"):
        restaurant = (
            db.query(Restaurant)
            .filter(func.lower(Restaurant.custom_domain) == custom_host)
            .one_or_none()
        )
        if restaurant:
            return restaurant

    tenant_subdomain = (subdomain or extract_subdomain(custom_host) or "").lower().strip()
    if not tenant_subdomain or tenant_subdomain in RESERVED_SUBDOMAINS:
        return None
    return (
        db.query(Restaurant)
        .filter(
            or_(
                func.lower(Restaurant.subdomain) == tenant_subdomain,
                func.lower(Restaurant.slug) == tenant_subdomain,
                func.replace(func.lower(Restaurant.slug), "-", "") == tenant_subdomain,
            )
        )
        .one_or_none()
    )


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
    subdomain = normalize_subdomain(payload.subdomain or slug)
    if subdomain in RESERVED_SUBDOMAINS:
        raise HTTPException(status_code=400, detail="Sous-domaine reserve")
    original_subdomain = subdomain
    counter = 1
    while db.query(Restaurant).filter(func.lower(Restaurant.subdomain) == subdomain).one_or_none():
        subdomain = f"{original_subdomain}{counter}"
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
        subdomain=subdomain,
        logo_url=payload.logo_url,
        cover_image_url=payload.cover_image_url,
        primary_color=payload.primary_color,
        secondary_color=payload.secondary_color,
        accent_color=payload.accent_color,
        background_color=payload.background_color,
        text_color=payload.text_color,
        button_color=payload.button_color,
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
        first_name=(payload.owner_first_name or "").strip(),
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


def _store_restaurant_logo(request: Request, restaurant: Restaurant, file: UploadFile, content: bytes) -> str:
    """Enregistre un logo sur disque et retourne l'URL publique."""
    if (file.content_type or "") not in ALLOWED_LOGO_TYPES:
        raise HTTPException(status_code=400, detail="Format logo invalide. Utilisez PNG, JPG ou WEBP.")
    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Logo trop volumineux. Taille maximale: 2 Mo.")
    extension = detect_image_extension(content)
    if not extension:
        raise HTTPException(status_code=400, detail="Fichier logo invalide ou corrompu.")

    LOGO_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{restaurant.id}-{uuid4().hex}{extension}"
    destination = LOGO_UPLOAD_DIR / filename
    destination.write_bytes(content)
    return str(request.url_for("uploads", path=f"logos/{filename}"))


@router.get("/public/tenant/resolve", response_model=TenantResolveOut)
@public_router.get("/tenant/resolve", response_model=TenantResolveOut)
def resolve_public_tenant(
    request: Request,
    host: str | None = None,
    subdomain: str | None = None,
    db: Session = Depends(get_db),
):
    """PUBLIC : resout le host courant vers la plateforme ou le restaurant tenant."""
    resolved_host = clean_host(host or request.headers.get("host"))
    if resolved_host in PLATFORM_HOSTS:
        return TenantResolveOut(type="platform", host=resolved_host, status="active")

    restaurant = find_restaurant_by_tenant(db, resolved_host, subdomain=subdomain)
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant introuvable")

    categories, dishes = get_public_menu_payload(db, restaurant)
    return TenantResolveOut(
        type="restaurant",
        host=resolved_host,
        subdomain=restaurant.subdomain or restaurant.slug,
        status="active" if restaurant.is_active else "suspended",
        restaurant=public_restaurant_payload(restaurant),
        categories=[public_category_payload(category) for category in categories],
        dishes=[public_dish_payload(dish) for dish in dishes],
    )


@router.get("/public/{slug}")
def get_public_restaurant(slug: str, db: Session = Depends(get_db)):
    """PUBLIC : infos d'affichage d'un restaurant pour sa landing / page de connexion."""
    restaurant = find_restaurant_by_tenant(db, "", subdomain=slug)
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant introuvable")
    return {
        "name": restaurant.name,
        "slug": restaurant.slug,
        "subdomain": restaurant.subdomain,
        "custom_domain": restaurant.custom_domain,
        "logo_url": restaurant.logo_url,
        "cover_image_url": restaurant.cover_image_url,
        "primary_color": restaurant.primary_color,
        "secondary_color": restaurant.secondary_color,
        "accent_color": restaurant.accent_color,
        "background_color": restaurant.background_color,
        "text_color": restaurant.text_color,
        "button_color": restaurant.button_color,
        "city": restaurant.city,
        "address": restaurant.address,
        "description": restaurant.description,
        "is_active": restaurant.is_active,
    }


@router.get("/me/branding", response_model=RestaurantBrandingPublic)
def get_my_restaurant_branding(
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    """Retourne l'identite visuelle du restaurant pour tout utilisateur tenant."""
    restaurant = db.get(Restaurant, current_user.restaurant_id)
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant introuvable")
    return restaurant


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


@router.patch("/{restaurant_id}/commission", response_model=RestaurantPublic)
def update_restaurant_commission(
    restaurant_id: str,
    payload: RestaurantCommissionIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Règle le taux de commission Bloomar One d'un tenant (SUPERADMIN, tracé)."""
    if current_user.role != Role.SUPERADMIN:
        raise HTTPException(status_code=403, detail="Seul un super administrateur peut régler la commission")
    restaurant = db.get(Restaurant, restaurant_id)
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant introuvable")
    previous = restaurant.bloomar_commission_rate
    restaurant.bloomar_commission_rate = payload.bloomar_commission_rate
    log_action(
        db,
        current_user,
        "restaurant.commission_update",
        "restaurant",
        restaurant.id,
        f"Commission Bloomar {restaurant.name}: {previous}% -> {payload.bloomar_commission_rate}%",
        {"previous_rate": previous, "new_rate": payload.bloomar_commission_rate},
    )
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

    incoming = payload.dict(exclude_unset=True)
    if "subdomain" in incoming and incoming["subdomain"]:
        incoming["subdomain"] = normalize_subdomain(incoming["subdomain"])
        if incoming["subdomain"] in RESERVED_SUBDOMAINS:
            raise HTTPException(status_code=400, detail="Sous-domaine reserve")
        existing = (
            db.query(Restaurant)
            .filter(
                func.lower(Restaurant.subdomain) == incoming["subdomain"],
                Restaurant.id != restaurant.id,
            )
            .one_or_none()
        )
        if existing:
            raise HTTPException(status_code=409, detail="Sous-domaine deja utilise")
    if "custom_domain" in incoming and incoming["custom_domain"]:
        incoming["custom_domain"] = clean_host(incoming["custom_domain"])
        existing = (
            db.query(Restaurant)
            .filter(
                func.lower(Restaurant.custom_domain) == incoming["custom_domain"],
                Restaurant.id != restaurant.id,
            )
            .one_or_none()
        )
        if existing:
            raise HTTPException(status_code=409, detail="Domaine personnalise deja utilise")

    for field, value in incoming.items():
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

    restaurant = db.get(Restaurant, current_user.restaurant_id)
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant introuvable")

    content = await file.read()
    restaurant.logo_url = _store_restaurant_logo(request, restaurant, file, content)
    db.commit()
    db.refresh(restaurant)
    restaurant.branches_count = max(
        1,
        db.query(Branch).filter(Branch.restaurant_id == restaurant.id).count(),
    )
    return restaurant


@router.post("/{restaurant_id}/logo", response_model=RestaurantPublic)
async def upload_restaurant_logo_as_superadmin(
    restaurant_id: str,
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """SUPERADMIN : importe le logo d'un restaurant (création / back-office plateforme)."""
    if current_user.role != Role.SUPERADMIN:
        raise HTTPException(status_code=403, detail="Seul un super administrateur peut importer ce logo")

    restaurant = db.get(Restaurant, restaurant_id)
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant introuvable")

    content = await file.read()
    restaurant.logo_url = _store_restaurant_logo(request, restaurant, file, content)
    db.commit()
    db.refresh(restaurant)
    restaurant.branches_count = max(
        1,
        db.query(Branch).filter(Branch.restaurant_id == restaurant.id).count(),
    )
    return restaurant
