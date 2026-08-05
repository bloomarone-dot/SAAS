"""Logique carte fidélité : 9 commandes repas ou 9× le même plat → 10e offert."""

from __future__ import annotations

import json
import re
from decimal import Decimal

from sqlalchemy.orm import Session

from app.modules.loyalty.models import LOYALTY_CYCLE, LOYALTY_STAMPS_FOR_REWARD, LoyaltyCard
from app.modules.orders.models import CustomerOrder


def normalize_loyalty_phone(phone: str | None) -> str:
    digits = re.sub(r"\D", "", str(phone or ""))
    if digits.startswith("237") and len(digits) >= 12:
        digits = digits[3:]
    if len(digits) == 10 and digits.startswith("0"):
        digits = digits[1:]
    return digits


def is_repas_item(item) -> bool:
    channel = (getattr(item, "sale_channel", None) or "REPAS").upper()
    return channel == "REPAS"


def count_loyalty_dishes(order: CustomerOrder) -> int:
    """Tampon commande : 1 si la commande contient au moins un repas (hors emballage)."""
    for item in order.items or []:
        if is_repas_item(item):
            return 1
    return 0


def eligible_repas_prices(order: CustomerOrder) -> list[float]:
    prices: list[float] = []
    for item in order.items or []:
        if not is_repas_item(item):
            continue
        qty = int(getattr(item, "quantity", 0) or 0)
        unit = float(getattr(item, "unit_price", 0) or 0)
        for _ in range(max(0, qty)):
            prices.append(unit)
    prices.sort()
    return prices


def _load_item_stamps(card: LoyaltyCard | None) -> dict[str, int]:
    if not card or not getattr(card, "item_stamps_json", None):
        return {}
    try:
        raw = json.loads(card.item_stamps_json)
        return {str(k): int(v) for k, v in raw.items()} if isinstance(raw, dict) else {}
    except (TypeError, ValueError, json.JSONDecodeError):
        return {}


def _save_item_stamps(card: LoyaltyCard, item_stamps: dict[str, int]) -> None:
    card.item_stamps_json = json.dumps(item_stamps)


def _compute_rewards(order: CustomerOrder, card: LoyaltyCard | None) -> dict:
    stamps_before = int(card.stamps if card else 0)
    order_stamp = count_loyalty_dishes(order)
    item_stamps = _load_item_stamps(card)
    discount = Decimal("0")
    free_dishes = 0
    repas_prices = eligible_repas_prices(order)

    if order_stamp and stamps_before >= LOYALTY_STAMPS_FOR_REWARD and repas_prices:
        discount += Decimal(str(repas_prices[0]))
        free_dishes += 1

    for item in order.items or []:
        if not is_repas_item(item) or not getattr(item, "menu_item_id", None):
            continue
        menu_item_id = str(item.menu_item_id)
        qty = int(getattr(item, "quantity", 0) or 0)
        if qty <= 0:
            continue
        before = int(item_stamps.get(menu_item_id, 0))
        after = before + qty
        item_free = after // LOYALTY_CYCLE - before // LOYALTY_CYCLE
        unit = float(getattr(item, "unit_price", 0) or 0)
        for _ in range(item_free):
            discount += Decimal(str(unit))
            free_dishes += 1

    stamps_after = (stamps_before + order_stamp) % LOYALTY_CYCLE if order_stamp else stamps_before
    next_free_orders = max(0, LOYALTY_STAMPS_FOR_REWARD - stamps_after) if order_stamp else LOYALTY_STAMPS_FOR_REWARD - stamps_before

    return {
        "stamps_before": stamps_before,
        "order_stamp": order_stamp,
        "free_dishes": free_dishes,
        "discount_amount": float(discount),
        "stamps_after": stamps_after,
        "next_free_in": next_free_orders,
        "item_stamps": item_stamps,
    }


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
        item_stamps_json="{}",
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
    rewards = _compute_rewards(order, card)
    free_dishes = rewards["free_dishes"]
    discount = rewards["discount_amount"]
    stamps_after = rewards["stamps_after"]
    next_free_in = rewards["next_free_in"]

    if not phone:
        message = "Renseignez le téléphone client pour la carte fidélité."
    elif free_dishes:
        message = (
            f"{free_dishes} repas offert(s) grâce à la fidélité (−{discount:.0f} FCFA). "
            "Valable sur les repas uniquement."
        )
    elif dishes:
        message = (
            f"Fidélité : {stamps_after}/{LOYALTY_STAMPS_FOR_REWARD} commandes repas — "
            f"encore {max(1, next_free_in)} commande(s) repas avant un plat offert "
            "(ou 9× le même plat)."
        )
    else:
        message = "Carte fidélité : repas uniquement (boissons non comptées)."

    return {
        "phone": phone or "",
        "customer_name": (card.customer_name if card else None) or order.customer_name,
        "stamps_before": rewards["stamps_before"],
        "dishes_in_order": dishes,
        "free_dishes": free_dishes,
        "discount_amount": discount,
        "stamps_after": stamps_after,
        "next_free_in": next_free_in,
        "message": message,
        "card": card,
    }


def apply_loyalty_on_payment(db: Session, order: CustomerOrder) -> dict:
    """Applique les repas offerts et met à jour les tampons. Ne commit pas."""
    preview = preview_loyalty(db, order)
    phone = preview["phone"]
    order_stamp = preview["dishes_in_order"]
    if not phone or (order_stamp <= 0 and preview["free_dishes"] <= 0):
        return preview

    card = get_or_create_card(db, order.restaurant_id, phone, order.customer_name)
    if not card:
        return preview

    rewards = _compute_rewards(order, card)
    discount = Decimal(str(rewards["discount_amount"]))
    free_dishes = rewards["free_dishes"]

    if free_dishes > 0 and discount > 0:
        order.discount_amount = float(Decimal(str(order.discount_amount or 0)) + discount)
        note = f"Fidélité: {free_dishes} repas offert(s)"
        existing = (order.notes or "").strip()
        if "Fidélité:" not in existing:
            order.notes = f"{existing} | {note}".strip(" |") if existing else note

    if order_stamp:
        card.stamps = (int(card.stamps or 0) + order_stamp) % LOYALTY_CYCLE
        card.total_dishes = int(card.total_dishes or 0) + order_stamp

    item_stamps = rewards["item_stamps"]
    for item in order.items or []:
        if not is_repas_item(item) or not getattr(item, "menu_item_id", None):
            continue
        menu_item_id = str(item.menu_item_id)
        qty = int(getattr(item, "quantity", 0) or 0)
        if qty > 0:
            item_stamps[menu_item_id] = (int(item_stamps.get(menu_item_id, 0)) + qty) % LOYALTY_CYCLE
    _save_item_stamps(card, item_stamps)

    card.free_meals_claimed = int(card.free_meals_claimed or 0) + free_dishes
    if order.customer_name:
        card.customer_name = order.customer_name.strip()[:160]

    preview["free_dishes"] = free_dishes
    preview["discount_amount"] = float(discount)
    preview["stamps_after"] = card.stamps
    preview["stamps_before"] = rewards["stamps_before"]
    preview["message"] = (
        f"{free_dishes} repas offert(s) (−{float(discount):.0f} FCFA). Tampons commandes : {card.stamps}/{LOYALTY_STAMPS_FOR_REWARD}."
        if free_dishes
        else f"Tampons fidélité : {card.stamps}/{LOYALTY_STAMPS_FOR_REWARD} commandes repas."
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
        "item_stamps": _load_item_stamps(card),
        "created_at": card.created_at,
        "updated_at": card.updated_at,
    }
