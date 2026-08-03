"""Logique carte fidélité : 9 plats → 10e offert."""

from __future__ import annotations

import re
from decimal import Decimal

from sqlalchemy.orm import Session

from app.modules.loyalty.models import LOYALTY_CYCLE, LOYALTY_STAMPS_FOR_REWARD, LoyaltyCard
from app.modules.orders.models import CustomerOrder, CustomerOrderItem


def normalize_loyalty_phone(phone: str | None) -> str:
    digits = re.sub(r"\D", "", str(phone or ""))
    if digits.startswith("237") and len(digits) >= 12:
        digits = digits[3:]
    if len(digits) == 10 and digits.startswith("0"):
        digits = digits[1:]
    return digits


def count_loyalty_dishes(order: CustomerOrder) -> int:
    """Compte les plats éligibles (hors emballage)."""
    total = 0
    for item in order.items or []:
        channel = (getattr(item, "sale_channel", None) or "REPAS").upper()
        if channel == "EMBALLAGE":
            continue
        qty = int(getattr(item, "quantity", 0) or 0)
        if qty > 0 and float(getattr(item, "unit_price", 0) or 0) >= 0:
            total += qty
    return total


def eligible_item_prices(order: CustomerOrder) -> list[float]:
    prices: list[float] = []
    for item in order.items or []:
        channel = (getattr(item, "sale_channel", None) or "REPAS").upper()
        if channel == "EMBALLAGE":
            continue
        qty = int(getattr(item, "quantity", 0) or 0)
        unit = float(getattr(item, "unit_price", 0) or 0)
        for _ in range(max(0, qty)):
            prices.append(unit)
    prices.sort()
    return prices


def get_or_create_card(
    db: Session,
    restaurant_id: str,
    phone: str,
    customer_name: str | None = None,
) -> LoyaltyCard | None:
    normalized = normalize_loyalty_phone(phone)
    if len(normalized) < 8:
        return None
    card = (
        db.query(LoyaltyCard)
        .filter(LoyaltyCard.restaurant_id == restaurant_id, LoyaltyCard.phone == normalized)
        .one_or_none()
    )
    if card:
        if customer_name and not card.customer_name:
            card.customer_name = customer_name.strip()[:160]
        return card
    card = LoyaltyCard(
        restaurant_id=restaurant_id,
        phone=normalized,
        customer_name=(customer_name or "").strip()[:160] or None,
        stamps=0,
        total_dishes=0,
        free_meals_claimed=0,
    )
    db.add(card)
    db.flush()
    return card


def preview_loyalty(db: Session, order: CustomerOrder) -> dict:
    phone = normalize_loyalty_phone(order.customer_phone)
    dishes = count_loyalty_dishes(order)
    card = (
        db.query(LoyaltyCard)
        .filter(LoyaltyCard.restaurant_id == order.restaurant_id, LoyaltyCard.phone == phone)
        .one_or_none()
        if phone
        else None
    )
    stamps_before = int(card.stamps if card else 0)
    free_dishes = 0
    discount = Decimal("0")
    if dishes > 0 and phone:
        free_dishes = (stamps_before + dishes) // LOYALTY_CYCLE - stamps_before // LOYALTY_CYCLE
        prices = eligible_item_prices(order)
        for index in range(min(free_dishes, len(prices))):
            discount += Decimal(str(prices[index]))
    stamps_after = (stamps_before + dishes) % LOYALTY_CYCLE if dishes else stamps_before
    next_free_in = LOYALTY_STAMPS_FOR_REWARD - stamps_after
    if next_free_in <= 0:
        next_free_in = LOYALTY_CYCLE - stamps_after if stamps_after else LOYALTY_STAMPS_FOR_REWARD
    message = (
        f"{free_dishes} plat(s) offert(s) grâce à la carte fidélité (−{float(discount):.0f} FCFA)."
        if free_dishes
        else f"Carte fidélité : {stamps_after}/{LOYALTY_STAMPS_FOR_REWARD} — encore {max(1, LOYALTY_STAMPS_FOR_REWARD - stamps_after)} plat(s) avant un offert."
    )
    return {
        "phone": phone or "",
        "customer_name": (card.customer_name if card else None) or order.customer_name,
        "stamps_before": stamps_before,
        "dishes_in_order": dishes,
        "free_dishes": free_dishes,
        "discount_amount": float(discount),
        "stamps_after": stamps_after,
        "next_free_in": max(0, LOYALTY_STAMPS_FOR_REWARD - stamps_after),
        "message": message,
        "card": card,
    }


def apply_loyalty_on_payment(db: Session, order: CustomerOrder) -> dict:
    """Applique les plats offerts (réduction) et met à jour les tampons. Ne commit pas."""
    preview = preview_loyalty(db, order)
    phone = preview["phone"]
    dishes = preview["dishes_in_order"]
    if not phone or dishes <= 0:
        return preview

    card = get_or_create_card(db, order.restaurant_id, phone, order.customer_name)
    if not card:
        return preview

    stamps_before = int(card.stamps or 0)
    free_dishes = (stamps_before + dishes) // LOYALTY_CYCLE - stamps_before // LOYALTY_CYCLE
    prices = eligible_item_prices(order)
    discount = Decimal("0")
    for index in range(min(free_dishes, len(prices))):
        discount += Decimal(str(prices[index]))

    if free_dishes > 0 and discount > 0:
        order.discount_amount = float(Decimal(str(order.discount_amount or 0)) + discount)
        note = f"Fidélité: {free_dishes} plat(s) offert(s)"
        existing = (order.notes or "").strip()
        if "Fidélité:" not in existing:
            order.notes = f"{existing} | {note}".strip(" |") if existing else note

    card.stamps = (stamps_before + dishes) % LOYALTY_CYCLE
    card.total_dishes = int(card.total_dishes or 0) + dishes
    card.free_meals_claimed = int(card.free_meals_claimed or 0) + free_dishes
    if order.customer_name:
        card.customer_name = order.customer_name.strip()[:160]

    preview["free_dishes"] = free_dishes
    preview["discount_amount"] = float(discount)
    preview["stamps_after"] = card.stamps
    preview["stamps_before"] = stamps_before
    preview["message"] = (
        f"{free_dishes} plat(s) offert(s) (−{float(discount):.0f} FCFA). Tampons : {card.stamps}/{LOYALTY_STAMPS_FOR_REWARD}."
        if free_dishes
        else f"Tampons fidélité : {card.stamps}/{LOYALTY_STAMPS_FOR_REWARD}."
    )
    return preview


def card_public_dict(card: LoyaltyCard) -> dict:
    stamps = int(card.stamps or 0)
    return {
        "id": card.id,
        "restaurant_id": card.restaurant_id,
        "phone": card.phone,
        "customer_name": card.customer_name,
        "stamps": stamps,
        "stamps_needed": LOYALTY_STAMPS_FOR_REWARD,
        "total_dishes": int(card.total_dishes or 0),
        "free_meals_claimed": int(card.free_meals_claimed or 0),
        "next_free_in": max(0, LOYALTY_STAMPS_FOR_REWARD - stamps),
        "created_at": card.created_at,
        "updated_at": card.updated_at,
    }
