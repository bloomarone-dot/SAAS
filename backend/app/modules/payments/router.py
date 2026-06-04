"""
Router paiements — Orange Money Cameroun.

Endpoints :
  POST   /payments/orange/initiate       Initie un paiement (caisse ou commande)
  GET    /payments/orange/status/{tx_id} Statut d'une transaction
  POST   /payments/orange/webhook        Notification asynchrone Orange/Y-Note
  GET    /payments/transactions          Historique des transactions du restaurant
"""

import logging
import os
from datetime import datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import assert_permission, require_tenant_user
from app.modules.orders.models import CustomerOrder
from app.modules.payments.models import PaymentTransaction
from app.modules.payments.orange_service import (
    OrangePaymentError,
    check_transaction_status,
    initiate_cashin,
    is_orange_configured,
    parse_orange_status,
    safe_json,
)
from app.modules.payments.schemas import (
    OrangePayInitIn,
    OrangePayInitOut,
    OrangeWebhookIn,
    PaymentStatusOut,
)
from app.modules.permissions.models import Permission
from app.modules.users.models import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/payments", tags=["payments"])


def _build_notify_url(request: Request) -> str:
    """Construit l'URL webhook à passer à Orange selon l'env."""
    base = os.getenv("APP_PUBLIC_URL", "").rstrip("/")
    if not base:
        base = str(request.base_url).rstrip("/")
    return f"{base}/api/v1/payments/orange/webhook"


# ─── Initier un paiement ─────────────────────────────────────────────────────

@router.post("/orange/initiate", response_model=OrangePayInitOut, status_code=201)
async def initiate_orange_payment(
    payload: OrangePayInitIn,
    request: Request,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    """
    Initie un appel de fonds Orange Money USSD push vers le numéro du client.
    Le client reçoit une notification USSD et valide avec son PIN.
    """
    assert_permission(current_user, Permission.CASHIER_UPDATE)

    if not is_orange_configured():
        raise HTTPException(
            status_code=503,
            detail="Paiement Orange Money non configuré sur ce serveur. Contactez l'administrateur.",
        )

    # Récupérer la commande
    order = db.get(CustomerOrder, payload.order_id)
    if not order or order.restaurant_id != current_user.restaurant_id:
        raise HTTPException(status_code=404, detail="Commande introuvable")

    if order.status in {"Payée", "Payee"}:
        raise HTTPException(status_code=400, detail="Cette commande est déjà payée")

    amount = int(order.total_amount)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Montant invalide")

    notify_url = _build_notify_url(request)

    # Créer la transaction en base (PENDING)
    tx = PaymentTransaction(
        restaurant_id=current_user.restaurant_id,
        order_id=order.id,
        provider="ORANGE_CM",
        amount=amount,
        currency="XAF",
        payer_msisdn=payload.payer_msisdn,
        status="PENDING",
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)

    try:
        result = await initiate_cashin(
            amount=amount,
            payer_msisdn=payload.payer_msisdn,
            order_ref=tx.id,  # on utilise l'ID transaction comme référence
            description=f"Commande {order.order_number}",
            notify_url=notify_url,
        )
    except OrangePaymentError as exc:
        tx.status = "FAILED"
        tx.failure_reason = str(exc)
        tx.raw_response = exc.raw[:2000]
        db.commit()
        logger.error("Orange Money init failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"Erreur Orange Money : {exc}")
    except Exception as exc:
        tx.status = "FAILED"
        tx.failure_reason = str(exc)
        db.commit()
        logger.error("Orange Money unexpected error: %s", exc)
        raise HTTPException(status_code=502, detail="Erreur inattendue lors de l'initiation du paiement")

    # Mettre à jour la transaction avec les infos retournées
    tx.pay_token = result.get("pay_token") or result.get("payToken")
    tx.notif_token = result.get("notif_token") or result.get("notifToken")
    tx.provider_tx_id = result.get("txnid") or result.get("transaction_id")
    tx.raw_response = safe_json(result)
    orange_status = parse_orange_status(result)
    tx.status = orange_status
    db.commit()

    # Mettre à jour la commande si paiement immédiatement confirmé
    if orange_status == "SUCCESS":
        order.payment_method = "Orange Money"
        order.status = "Payée"
        db.commit()

    ussd_code = f"*150*{payload.payer_msisdn}#"
    message_map = {
        "SUCCESS": "Paiement confirmé avec succès",
        "PENDING": "Demande envoyée. Le client doit valider le prompt USSD sur son téléphone.",
        "FAILED": result.get("message", "Échec du paiement"),
        "CANCELLED": "Paiement annulé",
        "EXPIRED": "Délai de paiement expiré",
    }

    return OrangePayInitOut(
        transaction_id=tx.id,
        pay_token=tx.pay_token or "",
        payment_url=result.get("payment_url"),
        ussd_code=ussd_code,
        status=tx.status,
        message=message_map.get(tx.status, "En attente de confirmation"),
    )


# ─── Vérifier le statut ───────────────────────────────────────────────────────

@router.get("/orange/status/{transaction_id}", response_model=PaymentStatusOut)
async def get_orange_payment_status(
    transaction_id: str,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    """
    Interroge le statut actuel d'une transaction.
    Rafraîchit depuis l'API Orange si la transaction est encore PENDING.
    """
    assert_permission(current_user, Permission.CASHIER_READ)

    tx = db.get(PaymentTransaction, transaction_id)
    if not tx or tx.restaurant_id != current_user.restaurant_id:
        raise HTTPException(status_code=404, detail="Transaction introuvable")

    # Si PENDING et pay_token disponible → interroger Orange
    if tx.status == "PENDING" and tx.pay_token:
        try:
            result = await check_transaction_status(tx.pay_token)
            new_status = parse_orange_status(result)
            if new_status != "PENDING":
                tx.status = new_status
                tx.raw_response = safe_json(result)
                # Mettre à jour la commande si payée
                if new_status == "SUCCESS" and tx.order_id:
                    order = db.get(CustomerOrder, tx.order_id)
                    if order:
                        order.payment_method = "Orange Money"
                        order.status = "Payée"
                db.commit()
        except Exception as exc:
            logger.warning("Impossible de vérifier le statut Orange: %s", exc)

    return PaymentStatusOut(
        transaction_id=tx.id,
        provider_tx_id=tx.provider_tx_id,
        status=tx.status,
        amount=tx.amount,
        currency=tx.currency,
        payer_msisdn=tx.payer_msisdn,
        failure_reason=tx.failure_reason,
        created_at=tx.created_at,
        updated_at=tx.updated_at,
    )


# ─── Webhook Orange/Y-Note ───────────────────────────────────────────────────

@router.post("/orange/webhook", status_code=200)
async def orange_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Endpoint de notification asynchrone appelé par Orange/Y-Note.
    Orange envoie le résultat final de la transaction ici.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}

    logger.info("Orange webhook received: %s", str(body)[:500])

    # Identifier la transaction par pay_token ou txnid
    pay_token = body.get("pay_token") or body.get("payToken")
    txnid = body.get("txnid") or body.get("transaction_id")

    tx = None
    if pay_token:
        tx = db.query(PaymentTransaction).filter(PaymentTransaction.pay_token == pay_token).first()
    if not tx and txnid:
        tx = db.query(PaymentTransaction).filter(PaymentTransaction.provider_tx_id == txnid).first()

    if not tx:
        # Transaction inconnue — on logue et on retourne 200 pour éviter les retransmissions
        logger.warning("Orange webhook: transaction inconnue pay_token=%s txnid=%s", pay_token, txnid)
        return {"received": True}

    new_status = parse_orange_status(body)
    tx.status = new_status
    tx.provider_tx_id = txnid or tx.provider_tx_id
    tx.raw_response = safe_json(body)
    tx.updated_at = datetime.utcnow()

    if new_status == "SUCCESS" and tx.order_id:
        order = db.get(CustomerOrder, tx.order_id)
        if order and order.status not in {"Payée", "Payee"}:
            order.payment_method = "Orange Money"
            order.status = "Payée"
            logger.info("Commande %s marquée Payée via webhook Orange", order.order_number)

    db.commit()
    return {"received": True}


# ─── Historique des transactions ─────────────────────────────────────────────

@router.get("/transactions", response_model=list[PaymentStatusOut])
def list_transactions(
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    status: str | None = Query(default=None),
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    """Liste les transactions de paiement du restaurant (30 derniers jours par défaut)."""
    assert_permission(current_user, Permission.ACCOUNTING_READ)

    end = end_date or datetime.utcnow()
    start = start_date or (end - timedelta(days=30))

    query = db.query(PaymentTransaction).filter(
        PaymentTransaction.restaurant_id == current_user.restaurant_id,
        PaymentTransaction.created_at >= start,
        PaymentTransaction.created_at <= end,
    )
    if status:
        query = query.filter(PaymentTransaction.status == status.upper())

    transactions = query.order_by(PaymentTransaction.created_at.desc()).limit(200).all()

    return [
        PaymentStatusOut(
            transaction_id=tx.id,
            provider_tx_id=tx.provider_tx_id,
            status=tx.status,
            amount=tx.amount,
            currency=tx.currency,
            payer_msisdn=tx.payer_msisdn,
            failure_reason=tx.failure_reason,
            created_at=tx.created_at,
            updated_at=tx.updated_at,
        )
        for tx in transactions
    ]
