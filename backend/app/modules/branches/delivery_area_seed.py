from sqlalchemy.orm import Session

from app.modules.branches.models import Branch, DeliveryArea
from app.modules.branches.yaounde_quartiers import (
    DEFAULT_QUARTIER_FEE,
    YAOUNDE_QUARTIERS,
    fee_for_quartier,
)
from app.modules.restaurants.models import Restaurant


def ensure_yaounde_delivery_areas(db: Session, restaurant_id: str, default_fee: float | None = None) -> int:
    """Ajoute les quartiers Yaoundé manquants et corrige les frais uniformes (ex. tout à 1000)."""
    restaurant = db.get(Restaurant, restaurant_id)
    if not restaurant:
        return 0

    fallback_fee = float(
        default_fee if default_fee is not None else restaurant.delivery_fee or DEFAULT_QUARTIER_FEE
    )
    branch = (
        db.query(Branch)
        .filter(Branch.restaurant_id == restaurant_id, Branch.is_active.is_(True))
        .order_by(Branch.created_at.asc())
        .first()
    )
    areas = db.query(DeliveryArea).filter(DeliveryArea.restaurant_id == restaurant_id).all()
    by_name = {(area.name or "").strip().lower(): area for area in areas}

    created = 0
    updated = 0
    # Anciens tarifs « tout pareil » qu'on peut écraser sans casser un réglage manuel fin.
    replaceable_fees = {0.0, 1000.0, float(restaurant.delivery_fee or 0)}

    for quartier in YAOUNDE_QUARTIERS:
        key = quartier.strip().lower()
        expected_fee = float(fee_for_quartier(quartier, fallback_fee))
        existing = by_name.get(key)
        if existing is None:
            db.add(
                DeliveryArea(
                    restaurant_id=restaurant_id,
                    branch_id=branch.id if branch else None,
                    name=quartier,
                    delivery_fee=expected_fee,
                    average_delivery_minutes=45,
                    is_active=True,
                )
            )
            created += 1
            continue

        current_fee = float(existing.delivery_fee or 0)
        if current_fee != expected_fee and current_fee in replaceable_fees:
            existing.delivery_fee = expected_fee
            updated += 1

    if created or updated:
        db.commit()
    return created + updated


def ensure_yaounde_delivery_areas_for_all_restaurants(db: Session) -> int:
    restaurants = db.query(Restaurant).filter(Restaurant.is_active.is_(True)).all()
    total = 0
    for restaurant in restaurants:
        total += ensure_yaounde_delivery_areas(db, restaurant.id)
    return total
