"""Agrégation fiable des encaissements par mode de paiement."""

from __future__ import annotations

from app.modules.orders.models import CustomerOrder

PAYMENT_BUCKETS = ("Espèces", "Mobile Money", "Carte", "Autre")

PAYMENT_INTENT_PREFIXES = (
    "paiement avant livraison",
    "paiement pendant la livraison",
    "paiement à la livraison",
    "paiement a la livraison",
)


def _method_lower(method: str | None) -> str:
    return (method or "").strip().lower()


def is_cash_method(method: str | None) -> bool:
    value = _method_lower(method)
    return value in {"espèces", "especes", "cash", "liquide"} or "espèce" in value or "espece" in value


def is_mobile_method(method: str | None) -> bool:
    value = _method_lower(method)
    return (
        "orange" in value
        or "mtn" in value
        or "mobile money" in value
        or "momo" in value
        or "dépôt orange" in value
        or "depot orange" in value
        or "dépôt mtn" in value
        or "depot mtn" in value
    )


def is_card_method(method: str | None) -> bool:
    value = _method_lower(method)
    return "carte" in value or "card" in value


def is_mixed_method(method: str | None) -> bool:
    value = _method_lower(method)
    return "mixte" in value


def is_payment_intent(method: str | None) -> bool:
    value = _method_lower(method)
    return any(value.startswith(prefix) for prefix in PAYMENT_INTENT_PREFIXES)


def classify_payment_bucket(method: str | None) -> str:
    if is_mixed_method(method):
        return "Autre"
    if is_cash_method(method):
        return "Espèces"
    if is_mobile_method(method):
        return "Mobile Money"
    if is_card_method(method):
        return "Carte"
    if is_payment_intent(method):
        # Commande payée mais libellé « paiement à la livraison » : encaissement caisse en espèces.
        return "Espèces"
    return "Autre"


def order_payment_breakdown(order: CustomerOrder) -> dict[str, float]:
    """Répartit le montant d'une facture payée dans les buckets standard."""
    buckets = {name: 0.0 for name in PAYMENT_BUCKETS}
    cash_part = getattr(order, "cash_paid_amount", None)
    mobile_part = getattr(order, "mobile_paid_amount", None)
    if cash_part is not None and mobile_part is not None:
        buckets["Espèces"] += float(cash_part or 0)
        buckets["Mobile Money"] += float(mobile_part or 0)
        return {key: round(value, 2) for key, value in buckets.items() if value > 0}

    amount = float(order.total_amount or 0)
    if amount <= 0:
        return {}
    bucket = classify_payment_bucket(order.payment_method)
    buckets[bucket] += amount
    return {key: round(value, 2) for key, value in buckets.items() if value > 0}


def aggregate_payment_methods(orders: list[CustomerOrder]) -> dict[str, float]:
    totals = {name: 0.0 for name in PAYMENT_BUCKETS}
    for order in orders:
        for bucket, amount in order_payment_breakdown(order).items():
            totals[bucket] = totals.get(bucket, 0.0) + float(amount or 0)
    return {key: round(value, 2) for key, value in totals.items() if value > 0}


def aggregate_delivery_fees(orders: list[CustomerOrder]) -> float:
    return round(sum(float(order.delivery_fee or 0) for order in orders), 2)


def bucket_amount(order: CustomerOrder, bucket: str) -> float:
    return float(order_payment_breakdown(order).get(bucket, 0) or 0)
