from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.modules.audit.models import AuditLog
from app.modules.permissions.models import Role
from app.modules.platform.models import PlatformSetting, RestaurantSubscription
from app.modules.platform.schemas import (
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
from app.modules.users.models import User
from app.security import hash_password


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
        last_checked_at=datetime.utcnow(),
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
