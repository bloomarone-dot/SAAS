from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import assert_permission, require_tenant_user
from app.modules.loyalty.models import LOYALTY_STAMPS_FOR_REWARD
from app.modules.loyalty.schemas import LoyaltyCardPublic, LoyaltyPreviewOut
from app.modules.loyalty.service import (
    card_public_dict,
    get_or_create_card,
    normalize_loyalty_phone,
    preview_loyalty,
)
from app.modules.orders.models import CustomerOrder
from app.modules.permissions.models import Permission
from app.modules.users.models import User
from app.tenancy import tenant_get_or_404

router = APIRouter(prefix="/loyalty", tags=["loyalty"])


@router.get("/cards/{phone}", response_model=LoyaltyCardPublic)
def get_loyalty_card(
    phone: str,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_permission(current_user, Permission.CASHIER_READ)
    normalized = normalize_loyalty_phone(phone)
    if len(normalized) < 8:
        raise HTTPException(status_code=400, detail="Numéro client invalide.")
    card = get_or_create_card(db, current_user.restaurant_id, normalized)
    db.commit()
    db.refresh(card)
    return LoyaltyCardPublic(**card_public_dict(card))


@router.get("/preview/{order_id}", response_model=LoyaltyPreviewOut)
def preview_order_loyalty(
    order_id: str,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_permission(current_user, Permission.CASHIER_READ)
    order = tenant_get_or_404(
        db, CustomerOrder, order_id, current_user.restaurant_id, detail="Commande introuvable"
    )
    data = preview_loyalty(db, order)
    return LoyaltyPreviewOut(
        phone=data["phone"],
        customer_name=data.get("customer_name"),
        stamps_before=data["stamps_before"],
        dishes_in_order=data["dishes_in_order"],
        free_dishes=data["free_dishes"],
        discount_amount=data["discount_amount"],
        stamps_after=data["stamps_after"],
        message=data["message"],
    )


@router.get("/info", response_model=dict)
def loyalty_program_info(current_user: User = Depends(require_tenant_user)):
    return {
        "stamps_needed": LOYALTY_STAMPS_FOR_REWARD,
        "description": f"Après {LOYALTY_STAMPS_FOR_REWARD} plats commandés, le {LOYALTY_STAMPS_FOR_REWARD + 1}e est offert par la maison.",
    }
