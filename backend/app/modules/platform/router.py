from datetime import date, datetime
from app.modules.shared.models import utcnow

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.modules.audit.models import AuditLog
from app.modules.audit.service import log_action
from app.modules.branches.models import Branch
from app.modules.notifications.service import notify
from app.modules.permissions.models import Role
from app.modules.platform.models import InstanceRequest, PlatformSetting, RestaurantSubscription
from app.modules.platform.schemas import (
    InstanceRequestApproveOut,
    InstanceRequestCreateIn,
    InstanceRequestPublic,
    PlatformActivityPublic,
    PlatformPaymentPublic,
    PlatformOverview,
    PlatformSettingsPublic,
    PlatformSettingsUpdateIn,
    PlatformUserPasswordResetIn,
    SubscriptionPublic,
    SubscriptionUpdateIn,
)
from app.modules.restaurants.models import Restaurant
from app.modules.restaurants.router import generate_slug
from app.modules.users.models import User
from app.security import generate_temporary_password, hash_password


router = APIRouter(prefix="/platform", tags=["platform"])

DEFAULT_SETTINGS = {
    "platform_name": "Restaurant SaaS",
    "support_email": "support@restaurant.test",
    "default_currency": "XAF",
    "default_timezone": "Africa/Douala",
    "trial_days": "14",
    "expiration_notice_days": "7",
    "allow_public_signup": "false",
    "require_owner_approval": "true",
}


def require_superadmin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != Role.SUPERADMIN:
        raise HTTPException(status_code=403, detail="Seul un super administrateur peut gerer la plateforme")
    return current_user


def _public_base_url() -> str:
    import os

    return os.getenv("APP_PUBLIC_URL", "").rstrip("/") or "http://localhost:5177"


def _unique_slug(db: Session, name: str) -> str:
    slug = generate_slug(name)
    base, counter = slug, 1
    while db.query(Restaurant).filter(Restaurant.slug == slug).one_or_none():
        counter += 1
        slug = f"{base}-{counter}"
    return slug


def _unique_username(db: Session, seed: str) -> str:
    base = generate_slug(seed).replace("-", "") or "admin"
    username, counter = base, 1
    while db.query(User).filter(User.username == username).one_or_none():
        counter += 1
        username = f"{base}{counter}"
    return username


# --- Demandes d'instance (landing publique + gestion superadmin) ---

@router.post("/instance-requests", response_model=InstanceRequestPublic, status_code=201)
def create_instance_request(payload: InstanceRequestCreateIn, db: Session = Depends(get_db)):
    """PUBLIC : un propriétaire sollicite la création de son instance restaurant."""
    request = InstanceRequest(
        restaurant_name=payload.restaurant_name.strip(),
        owner_name=payload.owner_name.strip(),
        owner_email=(payload.owner_email or "").lower().strip() or None,
        owner_phone=payload.owner_phone.strip(),
        city=payload.city,
        address=payload.address,
        business_type=payload.business_type,
        employees_count=payload.employees_count,
        message=payload.message,
        status="pending",
    )
    db.add(request)
    notify(
        db,
        title="Nouvelle demande d'instance",
        message=f"{request.restaurant_name} — {request.owner_name} ({request.owner_phone}) sollicite une instance.",
        role=Role.SUPERADMIN.value,
        category="platform",
        link="instance-requests",
    )
    db.commit()
    db.refresh(request)
    return request


@router.get("/instance-requests", response_model=list[InstanceRequestPublic])
def list_instance_requests(
    status: str | None = Query(default=None),
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    query = db.query(InstanceRequest)
    if status:
        query = query.filter(InstanceRequest.status == status)
    return query.order_by(InstanceRequest.created_at.desc()).limit(200).all()


@router.get("/instance-requests/{request_id}", response_model=InstanceRequestPublic)
def get_instance_request(request_id: str, current_user: User = Depends(require_superadmin), db: Session = Depends(get_db)):
    request = db.get(InstanceRequest, request_id)
    if not request:
        raise HTTPException(status_code=404, detail="Demande introuvable")
    return request


@router.post("/instance-requests/{request_id}/approve", response_model=InstanceRequestApproveOut)
def approve_instance_request(request_id: str, current_user: User = Depends(require_superadmin), db: Session = Depends(get_db)):
    """Approuve : crée le restaurant actif + un compte admin propriétaire."""
    request = db.get(InstanceRequest, request_id)
    if not request:
        raise HTTPException(status_code=404, detail="Demande introuvable")
    if request.status != "pending":
        raise HTTPException(status_code=409, detail="Cette demande a déjà été traitée")

    email = request.owner_email
    if email and db.query(User).filter(User.email == email).one_or_none():
        raise HTTPException(status_code=409, detail="Un utilisateur avec cet email existe déjà : créez le restaurant manuellement")

    slug = _unique_slug(db, request.restaurant_name)
    username = _unique_username(db, email.split("@")[0] if email else request.restaurant_name)
    temp_password = generate_temporary_password()
    name_parts = request.owner_name.split()
    first_name = name_parts[0]
    last_name = " ".join(name_parts[1:]) or name_parts[0]

    restaurant = Restaurant(
        name=request.restaurant_name,
        slug=slug,
        phone=request.owner_phone,
        email=email,
        city=request.city,
        address=request.address,
        is_active=True,
    )
    db.add(restaurant)
    db.flush()

    branch = Branch(
        restaurant_id=restaurant.id,
        name="Siège",
        city=request.city or "Ville à renseigner",
        address=request.address or "Adresse à renseigner",
        phone=request.owner_phone,
    )
    db.add(branch)
    db.flush()

    owner = User(
        email=email,
        username=username,
        password_hash=hash_password(temp_password),
        first_name=first_name,
        last_name=last_name,
        phone=request.owner_phone,
        role=Role.ADMIN,
        restaurant_id=restaurant.id,
        branch_id=branch.id,
        is_owner=True,
    )
    db.add(owner)
    db.flush()
    restaurant.owner_id = owner.id

    request.status = "approved"
    request.created_restaurant_id = restaurant.id
    request.reviewed_by = current_user.id
    request.reviewed_at = utcnow()
    log_action(
        db, current_user, "instance_request.approve", "instance_request", request.id,
        f"Demande d'instance approuvée: {restaurant.name} (slug {slug})",
        {"restaurant_id": restaurant.id, "slug": slug},
    )
    db.commit()

    base = _public_base_url()
    return InstanceRequestApproveOut(
        request_id=request.id,
        restaurant_id=restaurant.id,
        restaurant_slug=slug,
        landing_url=f"{base}/r/{slug}",
        login_url=f"{base}/r/{slug}/login",
        admin_username=username,
        admin_temporary_password=temp_password,
        message="Instance créée. Communiquez ces identifiants à l'administrateur du restaurant.",
    )


@router.post("/instance-requests/{request_id}/reject", response_model=InstanceRequestPublic)
def reject_instance_request(request_id: str, current_user: User = Depends(require_superadmin), db: Session = Depends(get_db)):
    request = db.get(InstanceRequest, request_id)
    if not request:
        raise HTTPException(status_code=404, detail="Demande introuvable")
    if request.status != "pending":
        raise HTTPException(status_code=409, detail="Cette demande a déjà été traitée")
    request.status = "rejected"
    request.reviewed_by = current_user.id
    request.reviewed_at = utcnow()
    log_action(
        db, current_user, "instance_request.reject", "instance_request", request.id,
        f"Demande d'instance rejetée: {request.restaurant_name}",
    )
    db.commit()
    db.refresh(request)
    return request


def get_or_create_subscription(db: Session, restaurant: Restaurant) -> RestaurantSubscription:
    subscription = (
        db.query(RestaurantSubscription)
        .filter(RestaurantSubscription.restaurant_id == restaurant.id)
        .one_or_none()
    )
    if subscription:
        return subscription

    subscription = RestaurantSubscription(
        restaurant_id=restaurant.id,
        currency=restaurant.currency or "XAF",
        status="A configurer" if restaurant.is_active else "Suspendu",
    )
    db.add(subscription)
    db.flush()
    return subscription


def serialize_subscription(subscription: RestaurantSubscription, restaurant: Restaurant) -> SubscriptionPublic:
    return SubscriptionPublic(
        id=subscription.id,
        restaurant_id=restaurant.id,
        restaurant_name=restaurant.name,
        restaurant_slug=restaurant.slug,
        restaurant_active=restaurant.is_active,
        plan=subscription.plan,
        amount=subscription.amount,
        currency=subscription.currency,
        status=subscription.status,
        renewal_date=subscription.renewal_date,
        notes=subscription.notes,
        created_at=subscription.created_at,
        updated_at=subscription.updated_at,
    )


@router.get("/subscriptions", response_model=list[SubscriptionPublic])
def list_subscriptions(
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    restaurants = db.query(Restaurant).order_by(Restaurant.created_at.desc()).all()
    rows = [serialize_subscription(get_or_create_subscription(db, restaurant), restaurant) for restaurant in restaurants]
    db.commit()
    return rows


@router.patch("/subscriptions/{restaurant_id}", response_model=SubscriptionPublic)
def update_subscription(
    restaurant_id: str,
    payload: SubscriptionUpdateIn,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    restaurant = db.get(Restaurant, restaurant_id)
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant introuvable")

    subscription = get_or_create_subscription(db, restaurant)
    subscription.plan = payload.plan.strip()
    subscription.amount = payload.amount
    subscription.currency = payload.currency.upper()
    subscription.status = payload.status.strip()
    subscription.renewal_date = payload.renewal_date
    subscription.notes = payload.notes

    # Renouvellement: une date d'échéance future réactive l'accès du tenant.
    if payload.renewal_date and payload.renewal_date >= date.today() and not restaurant.is_active:
        restaurant.is_active = True
        log_action(
            db,
            current_user,
            "subscription.reactivate",
            "restaurant",
            restaurant.id,
            f"Réactivation via renouvellement (échéance {payload.renewal_date})",
            {"renewal_date": str(payload.renewal_date)},
        )

    db.commit()
    db.refresh(subscription)
    return serialize_subscription(subscription, restaurant)


@router.get("/payments", response_model=list[PlatformPaymentPublic])
def list_platform_payments(
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    """Expose les paiements SaaS connus a partir des abonnements configures."""
    restaurants = db.query(Restaurant).order_by(Restaurant.created_at.desc()).all()
    rows: list[PlatformPaymentPublic] = []
    for restaurant in restaurants:
        subscription = get_or_create_subscription(db, restaurant)
        due_date = subscription.renewal_date
        is_paid = subscription.status == "Actif" and subscription.amount > 0
        rows.append(
            PlatformPaymentPublic(
                id=subscription.id,
                restaurant_id=restaurant.id,
                restaurant_name=restaurant.name,
                restaurant_slug=restaurant.slug,
                reference=f"SAAS-{restaurant.slug}-{subscription.created_at.strftime('%Y%m')}",
                amount=subscription.amount,
                currency=subscription.currency,
                status="Payé" if is_paid else subscription.status,
                method="Abonnement SaaS",
                paid_at=subscription.updated_at if is_paid else None,
                due_date=due_date,
            )
        )
    db.commit()
    return rows


@router.get("/activity", response_model=list[PlatformActivityPublic])
def list_platform_activity(
    limit: int = Query(default=100, ge=1, le=300),
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    """Retourne le journal global de plateforme pour le superadmin."""
    restaurants = {restaurant.id: restaurant.name for restaurant in db.query(Restaurant).all()}
    logs = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit).all()
    return [
        PlatformActivityPublic(
            id=log.id,
            restaurant_id=log.restaurant_id,
            restaurant_name=restaurants.get(log.restaurant_id),
            user_id=log.user_id,
            user_role=log.user_role,
            action=log.action,
            entity_type=log.entity_type,
            entity_id=log.entity_id,
            description=log.description,
            details_json=log.details_json,
            created_at=log.created_at,
        )
        for log in logs
    ]


@router.get("/settings", response_model=PlatformSettingsPublic)
def get_settings(
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    return read_settings(db)


@router.patch("/users/{user_id}/password")
def reset_platform_user_password(
    user_id: str,
    payload: PlatformUserPasswordResetIn,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    if user.role == Role.SUPERADMIN:
        raise HTTPException(status_code=400, detail="Ce compte plateforme ne peut pas etre modifie ici")

    user.password_hash = hash_password(payload.password)
    db.commit()
    return {"message": "Mot de passe réinitialisé."}


@router.patch("/settings", response_model=PlatformSettingsPublic)
def update_settings(
    payload: PlatformSettingsUpdateIn,
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    for key, value in payload.dict().items():
        setting = db.get(PlatformSetting, key)
        text_value = encode_setting(value)
        if setting:
            setting.value = text_value
        else:
            db.add(PlatformSetting(key=key, value=text_value))

    db.commit()
    return read_settings(db)


@router.get("/overview", response_model=PlatformOverview)
def get_overview(
    current_user: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    restaurants = db.query(Restaurant).all()
    subscriptions = db.query(RestaurantSubscription).all()
    configured = [item for item in subscriptions if item.status == "Actif" and item.amount > 0]
    pending = [item for item in subscriptions if item.status != "Actif" or item.amount == 0]
    currency = read_settings(db).default_currency

    return PlatformOverview(
        tenants_count=len(restaurants),
        active_tenants_count=sum(1 for restaurant in restaurants if restaurant.is_active),
        inactive_tenants_count=sum(1 for restaurant in restaurants if not restaurant.is_active),
        configured_subscriptions_count=len(configured),
        pending_subscriptions_count=max(0, len(restaurants) - len(configured)) if not pending else len(pending),
        monthly_recurring_revenue=sum(item.amount for item in configured),
        currency=currency,
        last_checked_at=utcnow(),
        checks=[
            {"label": "API backend", "value": "Reponse authentifiee", "status": "Actif"},
            {"label": "Base de donnees", "value": "Lecture restaurants et abonnements OK", "status": "Actif"},
            {"label": "Tenants actifs", "value": f"{sum(1 for restaurant in restaurants if restaurant.is_active)} / {len(restaurants)}", "status": "Actif"},
            {"label": "Paiements", "value": "Connecteur non configure dans cette version", "status": "Attention"},
        ],
    )


def read_settings(db: Session) -> PlatformSettingsPublic:
    stored = {setting.key: setting.value for setting in db.query(PlatformSetting).all()}
    data = {**DEFAULT_SETTINGS, **stored}
    return PlatformSettingsPublic(
        platform_name=data["platform_name"],
        support_email=data["support_email"],
        default_currency=data["default_currency"],
        default_timezone=data["default_timezone"],
        trial_days=int(data["trial_days"]),
        expiration_notice_days=int(data["expiration_notice_days"]),
        allow_public_signup=decode_bool(data["allow_public_signup"]),
        require_owner_approval=decode_bool(data["require_owner_approval"]),
    )


def encode_setting(value: object) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def decode_bool(value: str) -> bool:
    return value.lower() in {"1", "true", "yes", "on"}
