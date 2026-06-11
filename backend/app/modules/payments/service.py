import asyncio
import json
import logging
import os
from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.modules.audit.models import AuditLog
from app.modules.orders.models import CustomerOrder
from app.modules.payments.models import PaymentTransaction
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
    tx.pay_token = result.get("pay_token") or result.get("payToken")
    tx.notif_token = result.get("notif_token") or result.get("notifToken")
    tx.provider_tx_id = result.get("txnid") or result.get("transaction_id")
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


def release_failed_payment(
    db: Session,
    tx: PaymentTransaction,
    status: str,
    reason: str | None = None,
) -> None:
    tx.status = status
    tx.failure_reason = reason
    tx.active_order_key = None
    tx.completed_at = datetime.utcnow()
    order = db.get(CustomerOrder, tx.order_id) if tx.order_id else None
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

    now = datetime.utcnow()
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
        aggregator_fee = (gross * AGGREGATOR_RATE * CAMEROON_VAT_MULTIPLIER).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
        bloomar_commission = Decimal("0.00")
        restaurant_net = gross - aggregator_fee - bloomar_commission
        tx.status = "SUCCESS"
        tx.aggregator_fee = float(aggregator_fee)
        tx.bloomar_commission = float(bloomar_commission)
        tx.restaurant_net = float(restaurant_net)
        tx.active_order_key = None
        tx.completed_at = now
        order = db.get(CustomerOrder, tx.order_id) if tx.order_id else None
        if order:
            order.status = "Payée"
            order.payment_status = "SUCCESS"
            order.payment_locked = False
            order.payment_previous_status = None
            order.transaction_id = tx.id
            order.payment_method = "Orange Money" if tx.provider == "ORANGE_CM" else "MTN Mobile Money"
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
    elif new_status in TERMINAL_FAILURE_STATUSES:
        release_failed_payment(db, tx, new_status, body.get("message"))
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


async def reconcile_pending_transactions() -> int:
    db = SessionLocal()
    checked = 0
    try:
        cutoff = datetime.utcnow() - timedelta(seconds=15)
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
                tx.last_reconciled_at = datetime.utcnow()
                tx.reconciliation_status = provider_status
                tx.raw_response = safe_json(result)
                checked += 1
                if provider_status in TERMINAL_FAILURE_STATUSES:
                    release_failed_payment(db, tx, provider_status, result.get("message"))
                elif provider_status == "SUCCESS" and previous_reconciliation_status != "SUCCESS":
                    add_payment_audit(
                        db,
                        tx,
                        "payment.reconciliation_success_waiting_webhook",
                        "Succès détecté par réconciliation; webhook authentifié toujours requis",
                    )
                db.commit()
            except Exception as exc:
                db.rollback()
                logger.warning("Réconciliation impossible pour %s: %s", tx.id, exc)
    finally:
        db.close()
    return checked


async def reconciliation_loop() -> None:
    interval = max(15, int(os.getenv("PAYMENT_RECONCILIATION_INTERVAL_SECONDS", "60")))
    while True:
        try:
            await reconcile_pending_transactions()
        except Exception:
            logger.exception("Échec de la tâche de réconciliation Mobile Money")
        await asyncio.sleep(interval)
