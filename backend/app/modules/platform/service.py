"""Application automatique des abonnements : suspension a l'expiration.

Un restaurant dont l'abonnement a depasse sa `renewal_date` est suspendu
(`is_active = False`), ce qui bloque l'acces de tous ses comptes (cf.
`get_current_user`). La reactivation se fait au renouvellement (date future).
"""
import asyncio
import logging
import os
from datetime import date

from app.database import SessionLocal
from app.modules.audit.service import log_action
from app.modules.notifications.service import notify
from app.modules.platform.models import RestaurantSubscription
from app.modules.restaurants.models import Restaurant

logger = logging.getLogger(__name__)


def enforce_subscription_expiry_once() -> int:
    """Suspend les restaurants actifs dont l'abonnement a expire. Renvoie le nb suspendu."""
    db = SessionLocal()
    suspended = 0
    try:
        today = date.today()
        rows = (
            db.query(RestaurantSubscription, Restaurant)
            .join(Restaurant, Restaurant.id == RestaurantSubscription.restaurant_id)
            .filter(
                RestaurantSubscription.renewal_date.isnot(None),
                RestaurantSubscription.renewal_date < today,
                Restaurant.is_active.is_(True),
            )
            .all()
        )
        for subscription, restaurant in rows:
            restaurant.is_active = False
            subscription.status = "Suspendu"
            log_action(
                db,
                None,
                "subscription.auto_suspend",
                "restaurant",
                restaurant.id,
                f"Suspension automatique: abonnement expiré le {subscription.renewal_date}",
                {"renewal_date": str(subscription.renewal_date), "plan": subscription.plan},
            )
            # Admin du restaurant (email) + supervision plateforme (in-app).
            notify(
                db,
                restaurant_id=restaurant.id,
                role="ADMIN",
                title="Abonnement expiré",
                message=(
                    f"L'abonnement de {restaurant.name} a expiré le {subscription.renewal_date}. "
                    "L'accès est suspendu. Contactez Bloomar One pour le renouveler."
                ),
                category="security",
                link="dashboard",
                email=True,
            )
            notify(
                db,
                restaurant_id=None,
                role="SUPERADMIN",
                title="Tenant suspendu (abonnement)",
                message=f"{restaurant.name} suspendu automatiquement (abonnement expiré le {subscription.renewal_date}).",
                category="security",
                link="subscriptions",
            )
            suspended += 1
        db.commit()
        if suspended:
            logger.info("Suspension auto: %s restaurant(s) suspendu(s) pour abonnement expiré", suspended)
    except Exception:
        db.rollback()
        logger.exception("Échec de l'application des expirations d'abonnement")
    finally:
        db.close()
    return suspended


async def subscription_enforcement_loop() -> None:
    interval = max(3600, int(os.getenv("SUBSCRIPTION_CHECK_INTERVAL_SECONDS", "21600")))  # 6h
    while True:
        try:
            enforce_subscription_expiry_once()
        except Exception:
            logger.exception("Échec de la tâche d'expiration d'abonnement")
        await asyncio.sleep(interval)
