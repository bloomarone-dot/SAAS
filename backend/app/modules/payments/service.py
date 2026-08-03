import asyncio
import json
import logging
import os
from datetime import datetime, timedelta
from app.modules.shared.models import utcnow
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.modules.audit.models import AuditLog
from app.modules.notifications.service import notify
from app.modules.orders.models import CustomerOrder
from app.modules.payments.models import PaymentRequest, PaymentTransaction
from app.modules.payments.realtime import payment_connections
from app.modules.restaurants.models import Restaurant
from app.modules.payments.mtn_service import (
    check_transaction_status as check_mtn_status,
    parse_mtn_status,
)
from app.modules.payments.orange_service import (
    check_transaction_status as check_orange_status,
    parse_orange_status,
    safe_json,
)

logger = logging.getLogger(__name__)
ACTIVE_STATUSES = {"PENDING"}
TERMINAL_FAILURE_STATUSES = {"FAILED", "CANCELLED", "EXPIRED"}
AGGREGATOR_RATE = Decimal("0.01")
CAMEROON_VAT_MULTIPLIER = Decimal("1.1925")
_CENTS = Decimal("0.01")


def compute_payment_split(gross: Decimal, bloomar_rate_percent: Decimal) -> dict[str, Decimal]:
    """Ventilation financière d'un paiement (tout en Decimal, persistée définitivement).

    - Frais agrégateur TTC = brut × 1% × 1.1925
    - Commission Bloomar One = brut × (taux tenant en %)
    - Net restaurant = brut − frais agrégateur − commission Bloomar
    """
    aggregator_fee = (gross * AGGREGATOR_RATE * CAMEROON_VAT_MULTIPLIER).quantize(
        _CENTS, rounding=ROUND_HALF_UP
    )
    bloomar_commission = (gross * (bloomar_rate_percent / Decimal("100"))).quantize(
        _CENTS, rounding=ROUND_HALF_UP
    )
    restaurant_net = (gross - aggregator_fee - bloomar_commission).quantize(
        _CENTS, rounding=ROUND_HALF_UP
    )
    return {
        "aggregator_fee": aggregator_fee,
        "bloomar_commission": bloomar_commission,
        "restaurant_net": restaurant_net,
    }


def add_payment_audit(
    db: Session,
    tx: PaymentTransaction,
    action: str,
    description: str,
    details: dict | None = None,
    user_id: str | None = None,
    user_role: str | None = None,
) -> None:
    db.add(
        AuditLog(
            restaurant_id=tx.restaurant_id,
            user_id=user_id,
            user_role=user_role,
            action=action,
            entity_type="payment_transaction",
            entity_id=tx.id,
            description=description[:255],
            details_json=json.dumps(details, ensure_ascii=False, default=str) if details else None,
        )
    )


def create_pending_transaction(
    db: Session,
    order: CustomerOrder,
    provider: str,
    payer_msisdn: str,
    user_id: str,
    user_role: str,
) -> PaymentTransaction:
    if order.payment_locked or order.status == "PENDING_PAYMENT":
        raise ValueError("Un paiement est déjà actif pour cette facture")
    if order.status not in {"Prête", "Livrée"}:
        raise ValueError("La caisse ne peut encaisser que les commandes prêtes ou servies")

    tx = PaymentTransaction(
        restaurant_id=order.restaurant_id,
        order_id=order.id,
        active_order_key=order.id,
        provider=provider,
        amount=float(order.total_amount),
        currency="XAF",
        payer_msisdn=payer_msisdn,
        status="PENDING",
    )
    order.payment_previous_status = order.status
    order.status = "PENDING_PAYMENT"
    order.payment_status = "PENDING"
    order.payment_locked = True
    order.payment_method = "Orange Money" if provider == "ORANGE_CM" else "MTN Mobile Money"
    order.cashier_id = user_id
    db.add(tx)
    try:
        db.flush()
        order.transaction_id = tx.id
        add_payment_audit(
            db,
            tx,
            "payment.created",
            f"Paiement {provider} créé pour {order.order_number}",
            {"amount": tx.amount, "payer_msisdn": payer_msisdn},
            user_id,
            user_role,
        )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ValueError("Un paiement est déjà actif pour cette facture") from exc
    db.refresh(tx)
    return tx


def record_push_response(
    db: Session,
    tx: PaymentTransaction,
    result: dict,
    parsed_status: str,
) -> None:
    payload = result if isinstance(result, dict) else {}
    nested = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    merged = {**nested, **payload}
    tx.pay_token = merged.get("pay_token") or merged.get("payToken")
    tx.notif_token = merged.get("notif_token") or merged.get("notifToken")
    tx.provider_tx_id = merged.get("txnid") or merged.get("transaction_id")
    tx.raw_response = safe_json(result)
    tx.reconciliation_status = parsed_status
    if parsed_status in TERMINAL_FAILURE_STATUSES:
        release_failed_payment(db, tx, parsed_status, result.get("message"))
    else:
        # Une réponse synchrone SUCCESS n'est pas une preuve de paiement.
        tx.status = "PENDING"
        add_payment_audit(
            db,
            tx,
            "payment.push_sent",
            "Push USSD émis; confirmation webhook attendue",
            {"provider_status": parsed_status, "provider_tx_id": tx.provider_tx_id},
        )
    db.commit()


def load_transaction_order(db: Session, tx: PaymentTransaction) -> CustomerOrder | None:
    """Charge la commande liee en imposant le meme restaurant que la transaction."""
    if not tx.order_id or not tx.restaurant_id:
        return None
    return (
        db.query(CustomerOrder)
        .filter(
            CustomerOrder.id == tx.order_id,
            CustomerOrder.restaurant_id == tx.restaurant_id,
        )
        .one_or_none()
    )


def load_transaction_restaurant(db: Session, tx: PaymentTransaction) -> Restaurant | None:
    if not tx.restaurant_id:
        return None
    return db.query(Restaurant).filter(Restaurant.id == tx.restaurant_id).one_or_none()


def release_failed_payment(
    db: Session,
    tx: PaymentTransaction,
    status: str,
    reason: str | None = None,
) -> None:
    tx.status = status
    tx.failure_reason = reason
    tx.active_order_key = None
    tx.completed_at = utcnow()
    order = load_transaction_order(db, tx)
    if order and order.transaction_id == tx.id:
        order.status = order.payment_previous_status or "Livrée"
        order.payment_previous_status = None
        order.payment_status = status
        order.payment_locked = False
    add_payment_audit(
        db,
        tx,
        f"payment.{status.lower()}",
        f"Paiement terminé avec le statut {status}",
        {"reason": reason},
    )


def mark_push_failure(db: Session, tx: PaymentTransaction, reason: str, raw: str = "") -> None:
    tx.raw_response = raw[:2000] if raw else tx.raw_response
    release_failed_payment(db, tx, "FAILED", reason)
    db.commit()


def apply_webhook(
    db: Session,
    tx: PaymentTransaction,
    body: dict,
    new_status: str,
) -> bool:
    if tx.status == "SUCCESS":
        add_payment_audit(
            db,
            tx,
            "payment.webhook_duplicate",
            "Webhook dupliqué ignoré pour une transaction déjà validée",
        )
        db.commit()
        return False

    now = utcnow()
    tx.webhook_received_at = now
    tx.raw_webhook = safe_json(body)
    tx.provider_tx_id = body.get("txnid") or body.get("transaction_id") or tx.provider_tx_id
    add_payment_audit(
        db,
        tx,
        "payment.webhook_received",
        "Webhook authentifié reçu",
        {"provider_status": new_status},
    )

    if new_status == "SUCCESS":
        gross = Decimal(str(tx.amount))
        restaurant = load_transaction_restaurant(db, tx)
        bloomar_rate = Decimal(str(getattr(restaurant, "bloomar_commission_rate", 0) or 0))
        split = compute_payment_split(gross, bloomar_rate)
        aggregator_fee = split["aggregator_fee"]
        bloomar_commission = split["bloomar_commission"]
        restaurant_net = split["restaurant_net"]
        tx.status = "SUCCESS"
        tx.aggregator_fee = float(aggregator_fee)
        tx.bloomar_commission = float(bloomar_commission)
        tx.restaurant_net = float(restaurant_net)
        tx.active_order_key = None
        tx.completed_at = now
        order = load_transaction_order(db, tx)
        if order:
            order.status = "Payée"
            order.payment_status = "SUCCESS"
            order.payment_locked = False
            order.payment_previous_status = None
            order.transaction_id = tx.id
            order.payment_method = "Orange Money" if tx.provider == "ORANGE_CM" else "MTN Mobile Money"
            if not order.paid_at:
                order.paid_at = now
            from app.modules.loyalty.service import apply_loyalty_on_payment
            from app.modules.finance.router import PaymentMethod, post_order_sale_entry_safe, post_payment_fees_entry_safe

            apply_loyalty_on_payment(db, order)
            subtotal = sum(
                float(item.line_total or 0)
                for item in (order.items or [])
                if getattr(item, "sale_channel", None) != "EMBALLAGE"
            )
            order.total_amount = max(
                0.0,
                subtotal + float(order.delivery_fee or 0) - float(order.discount_amount or 0),
            )
            post_order_sale_entry_safe(db, order, getattr(order, "cashier_id", None), payment_method=PaymentMethod.MOBILE_MONEY)
            # Frais opérateur + commission plateforme : Débit 627 / Crédit trésorerie (brut -> net).
            fees = Decimal(str(aggregator_fee or 0)) + Decimal(str(bloomar_commission or 0))
            post_payment_fees_entry_safe(
                db, tx.restaurant_id,
                source_id=tx.id, reference=getattr(order, "order_number", None) or tx.id,
                amount=fees, user_id=getattr(order, "cashier_id", None),
            )
        add_payment_audit(
            db,
            tx,
            "payment.success",
            "Paiement validé par webhook authentifié",
            {
                "gross_amount": float(gross),
                "aggregator_fee": float(aggregator_fee),
                "bloomar_commission": float(bloomar_commission),
                "restaurant_net": float(restaurant_net),
            },
        )
        notify_payment_outcome(db, tx, order, success=True)
    elif new_status in TERMINAL_FAILURE_STATUSES:
        order = load_transaction_order(db, tx)
        release_failed_payment(db, tx, new_status, body.get("message"))
        notify_payment_outcome(db, tx, order, success=False)
    else:
        add_payment_audit(
            db,
            tx,
            "payment.webhook_pending",
            "Webhook reçu sans statut final",
            {"provider_status": new_status},
        )
    db.commit()
    return True


def find_transaction(db: Session, provider: str, body: dict) -> PaymentTransaction | None:
    pay_token = body.get("pay_token") or body.get("payToken")
    provider_tx_id = body.get("txnid") or body.get("transaction_id")
    internal_id = body.get("order_id") or body.get("reference")
    query = db.query(PaymentTransaction).filter(PaymentTransaction.provider == provider)
    if pay_token:
        tx = query.filter(PaymentTransaction.pay_token == pay_token).first()
        if tx:
            return tx
    if provider_tx_id:
        tx = query.filter(PaymentTransaction.provider_tx_id == provider_tx_id).first()
        if tx:
            return tx
    if internal_id:
        return query.filter(PaymentTransaction.id == str(internal_id)).first()
    return None


async def _broadcast_payment(tx: PaymentTransaction, event_name: str) -> None:
    try:
        await payment_connections.broadcast(
            tx.restaurant_id,
            {
                "event": event_name,
                "transaction_id": tx.id,
                "order_id": tx.order_id,
                "provider": tx.provider,
                "status": tx.status,
                "amount": tx.amount,
            },
        )
    except Exception:  # le temps réel ne doit jamais casser la réconciliation
        logger.debug("Broadcast de réconciliation impossible pour %s", tx.id)


async def reconcile_pending_transactions() -> int:
    db = SessionLocal()
    checked = 0
    expiry_seconds = max(60, int(os.getenv("PAYMENT_EXPIRY_SECONDS", "300")))
    failed_events: list[tuple[PaymentTransaction, str]] = []
    try:
        now = utcnow()
        cutoff = now - timedelta(seconds=15)
        expiry_cutoff = now - timedelta(seconds=expiry_seconds)
        transactions = (
            db.query(PaymentTransaction)
            .filter(
                PaymentTransaction.status == "PENDING",
                PaymentTransaction.created_at <= cutoff,
                PaymentTransaction.pay_token.isnot(None),
            )
            .order_by(PaymentTransaction.created_at.asc())
            .limit(100)
            .all()
        )
        for tx in transactions:
            try:
                if tx.provider == "ORANGE_CM":
                    result = await check_orange_status(tx.pay_token)
                    provider_status = parse_orange_status(result)
                elif tx.provider == "MTN_CM":
                    result = await check_mtn_status(tx.pay_token)
                    provider_status = parse_mtn_status(result)
                else:
                    continue
                previous_reconciliation_status = tx.reconciliation_status
                tx.last_reconciled_at = utcnow()
                tx.reconciliation_status = provider_status
                tx.raw_response = safe_json(result)
                checked += 1
                if provider_status in TERMINAL_FAILURE_STATUSES:
                    release_failed_payment(db, tx, provider_status, result.get("message"))
                    failed_events.append((tx, "payment_failed"))
                elif provider_status == "SUCCESS" and previous_reconciliation_status != "SUCCESS":
                    add_payment_audit(
                        db,
                        tx,
                        "payment.reconciliation_success_waiting_webhook",
                        "Succès détecté par réconciliation; webhook authentifié toujours requis",
                    )
                elif provider_status not in {"SUCCESS"} and tx.created_at <= expiry_cutoff:
                    # Garde-fou: paiement jamais confirmé -> EXPIRED, facture déverrouillée.
                    release_failed_payment(
                        db, tx, "EXPIRED", "Délai de confirmation dépassé"
                    )
                    failed_events.append((tx, "payment_failed"))
                db.commit()
            except Exception as exc:
                db.rollback()
                logger.warning("Réconciliation impossible pour %s: %s", tx.id, exc)
    finally:
        db.close()

    # Notifications temps réel APRÈS persistance (jamais source de vérité).
    for tx, event_name in failed_events:
        await _broadcast_payment(tx, event_name)
    return checked


async def reconciliation_loop() -> None:
    interval = max(15, int(os.getenv("PAYMENT_RECONCILIATION_INTERVAL_SECONDS", "60")))
    while True:
        try:
            await reconcile_pending_transactions()
        except Exception:
            logger.exception("Échec de la tâche de réconciliation Mobile Money")
        await asyncio.sleep(interval)


# --- Demandes de paiement (serveur -> caisse) ---

REQUESTABLE_STATUSES = {"Prête", "Livrée", "Servie"}
PAID_STATUSES = {"Payée", "Payee"}
METHOD_LABELS = {"ORANGE": "Orange Money", "MTN": "MTN Mobile Money", "CASH": "Espèces"}


def _money(value: float) -> str:
    return f"{int(round(value or 0)):,} FCFA".replace(",", " ")


def _user_display_name(user) -> str | None:
    full = f"{getattr(user, 'first_name', '') or ''} {getattr(user, 'last_name', '') or ''}".strip()
    return full or getattr(user, "username", None)


def _provider_label(provider: str) -> str:
    return "Orange Money" if provider == "ORANGE_CM" else "MTN Mobile Money"


def notify_payment_outcome(db: Session, tx: PaymentTransaction, order, success: bool) -> None:
    """Notifie la caisse et le serveur demandeur de l'issue d'un paiement mobile.

    Comble le maillon manquant : la confirmation/échec n'était diffusée qu'en
    WebSocket éphémère. On persiste désormais une notification.
    """
    order_number = getattr(order, "order_number", None) or tx.order_id
    label = _provider_label(tx.provider)
    if success:
        cashier_title, cashier_msg = (
            "Paiement confirmé",
            f"Commande {order_number} payée — {label} · {_money(tx.amount)}.",
        )
        owner_title, owner_msg = (
            "Paiement client confirmé",
            f"Votre demande de paiement pour {order_number} a été confirmée ({_money(tx.amount)}).",
        )
    else:
        reason = tx.failure_reason or "non confirmé"
        cashier_title, cashier_msg = (
            "Paiement échoué",
            f"Échec du paiement {label} pour {order_number} : {reason}.",
        )
        owner_title, owner_msg = (
            "Paiement client échoué",
            f"La demande de paiement pour {order_number} a échoué : {reason}.",
        )

    # Un echec de paiement est actionnable -> double canal email.
    notify(
        db,
        title=cashier_title,
        message=cashier_msg,
        restaurant_id=tx.restaurant_id,
        role="CAISSE",
        category="payment",
        link="unpaid-orders",
        email=not success,
    )
    # Serveur à l'origine de la demande (le cas échéant).
    request = (
        db.query(PaymentRequest)
        .filter(PaymentRequest.transaction_id == tx.id)
        .order_by(PaymentRequest.created_at.desc())
        .first()
    )
    if request and request.requested_by_id:
        notify(
            db,
            title=owner_title,
            message=owner_msg,
            restaurant_id=tx.restaurant_id,
            user_id=request.requested_by_id,
            category="payment",
            link="orders",
            email=not success,
        )


def create_payment_request(
    db: Session,
    order: CustomerOrder,
    method: str,
    payer_msisdn: str | None,
    note: str | None,
    user,
) -> PaymentRequest:
    """Crée une demande de paiement émise par un serveur pour la caisse."""
    if order.status in PAID_STATUSES:
        raise ValueError("Cette commande est déjà payée")
    if order.payment_locked or order.status == "PENDING_PAYMENT":
        raise ValueError("Un paiement est déjà actif pour cette facture")
    if not getattr(order, "is_closed", False) and order.status not in REQUESTABLE_STATUSES:
        raise ValueError("La demande n'est possible que sur une commande fermée, prête, servie ou livrée")

    existing = (
        db.query(PaymentRequest)
        .filter(PaymentRequest.order_id == order.id, PaymentRequest.status == "PENDING")
        .first()
    )
    if existing:
        raise ValueError("Une demande de paiement est déjà en attente pour cette commande")

    request = PaymentRequest(
        restaurant_id=order.restaurant_id,
        order_id=order.id,
        method=method,
        payer_msisdn=payer_msisdn or None,
        amount=float(order.total_amount or 0),
        note=note or None,
        status="PENDING",
        requested_by_id=getattr(user, "id", None),
        requested_by_name=_user_display_name(user),
    )
    db.add(request)

    server_name = request.requested_by_name or "Un serveur"
    notify(
        db,
        title="Nouvelle demande de paiement",
        message=(
            f"{server_name} demande l'encaissement de la commande {order.order_number} "
            f"({METHOD_LABELS.get(method, method)} · {_money(request.amount)})."
        ),
        restaurant_id=order.restaurant_id,
        role="CAISSE",
        category="payment",
        link="unpaid-orders",
    )
    db.commit()
    db.refresh(request)
    return request


def list_payment_requests(
    db: Session,
    restaurant_id: str,
    status: str | None = None,
) -> list[PaymentRequest]:
    query = db.query(PaymentRequest).filter(PaymentRequest.restaurant_id == restaurant_id)
    if status:
        query = query.filter(PaymentRequest.status == status.upper())
    return query.order_by(PaymentRequest.created_at.desc()).limit(200).all()


def notify_request_owner(
    db: Session,
    request: PaymentRequest,
    order_number: str,
    title: str,
    message: str,
) -> None:
    if not request.requested_by_id:
        return
    notify(
        db,
        title=title,
        message=message,
        restaurant_id=request.restaurant_id,
        user_id=request.requested_by_id,
        category="payment",
        link="orders",
    )


def reject_payment_request(db: Session, request: PaymentRequest, user, order_number: str) -> None:
    request.status = "REJECTED"
    request.validated_by_id = getattr(user, "id", None)
    notify_request_owner(
        db,
        request,
        order_number,
        "Demande de paiement rejetée",
        f"La caisse a rejeté la demande de paiement de la commande {order_number}.",
    )
    db.commit()


def close_pending_payment_requests_for_order(
    db: Session,
    order: CustomerOrder,
    user,
    *,
    payment_method: str | None = None,
) -> int:
    """Ferme les demandes PENDING d'une commande après encaissement direct caisse.

    Évite les demandes orphelines quand la caisse encaisse via /payment
    (avec choix Espèces/Carte) au lieu du bouton validate de la demande.
    """
    pending = (
        db.query(PaymentRequest)
        .filter(
            PaymentRequest.order_id == order.id,
            PaymentRequest.restaurant_id == order.restaurant_id,
            PaymentRequest.status == "PENDING",
        )
        .all()
    )
    method_label = (payment_method or order.payment_method or "Espèces").strip()
    for request_obj in pending:
        request_obj.status = "VALIDATED"
        request_obj.validated_by_id = getattr(user, "id", None)
        notify_request_owner(
            db,
            request_obj,
            order.order_number,
            "Paiement encaissé",
            f"La caisse a encaissé la commande {order.order_number} ({method_label}).",
        )
    return len(pending)