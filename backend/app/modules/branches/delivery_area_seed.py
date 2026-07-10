from sqlalchemy.orm import Session

from app.modules.branches.models import Branch, DeliveryArea
from app.modules.branches.yaounde_quartiers import YAOUNDE_QUARTIERS
from app.modules.restaurants.models import Restaurant


def ensure_yaounde_delivery_areas(db: Session, restaurant_id: str, default_fee: float | None = None) -> int:
    """Ajoute les quartiers de Yaoundé manquants pour un restaurant (idempotent)."""
    restaurant = db.get(Restaurant, restaurant_id)
    if not restaurant:
        return 0

    fee = float(default_fee if default_fee is not None else restaurant.delivery_fee or 1000)
    branch = (
        db.query(Branch)
        .filter(Branch.restaurant_id == restaurant_id, Branch.is_active.is_(True))
        .order_by(Branch.created_at.asc())
        .first()
    )
    existing_names = {
        (name or "").strip().lower()
        for (name,) in db.query(DeliveryArea.name).filter(DeliveryArea.restaurant_id == restaurant_id).all()
    }

    created = 0
    for quartier in YAOUNDE_QUARTIERS:
        key = quartier.strip().lower()
        if not key or key in existing_names:
            continue
        db.add(
            DeliveryArea(
                restaurant_id=restaurant_id,
                branch_id=branch.id if branch else None,
                name=quartier,
                delivery_fee=fee,
                average_delivery_minutes=45,
                is_active=True,
            )
        )
        existing_names.add(key)
        created += 1

    if created:
        db.commit()
    return created


def ensure_yaounde_delivery_areas_for_all_restaurants(db: Session) -> int:
    restaurants = db.query(Restaurant).filter(Restaurant.is_active.is_(True)).all()
    total = 0
    for restaurant in restaurants:
        total += ensure_yaounde_delivery_areas(db, restaurant.id)
    return total
