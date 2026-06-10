import ipaddress
import json
import logging
import os
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db
from app.dependencies import assert_permission, require_tenant_user
from app.tenancy import tenant_get_or_404
from app.modules.orders.models import CustomerOrder
from app.modules.payments.models import PaymentTransaction
from app.modules.payments.mtn_service import (
    MtnPaymentError,
    get_mtn_config,
    initiate_cashin as initiate_mtn_cashin,
    is_mtn_configured,
    parse_mtn_status,
)
from app.modules.payments.orange_service import (
    OrangePaymentError,
    get_orange_config,
    initiate_cashin as initiate_orange_cashin,
    is_orange_configured,
    parse_orange_status,
)
from app.modules.payments.realtime import payment_connections
from app.modules.payments.schemas import (
    MtnPayInitIn,
    MtnPayInitOut,
    OrangePayInitIn,
    OrangePayInitOut,
    PaymentStatusOut,
)
from app.modules.payments.service import (
    apply_webhook,
    create_pending_transaction,
    find_transaction,
    mark_push_failure,
    record_push_response,
)
from app.modules.permissions.models import Permission
from app.modules.users.models import User
from app.security import decode_access_token, verify_hmac_sha256_signature

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/payments", tags=["payments"])


def _build_notify_url(request: Request, provider: str) -> str:
    base = os.getenv("APP_PUBLIC_URL", "").rstrip("/") or str(request.base_url).rstrip("/")
    return f"{base}/api/v1/payments/{provider}/webhook"


def _status_out(tx: PaymentTransaction) -> PaymentStatusOut:
    return PaymentStatusOut(
        transaction_id=tx.id,
        provider_tx_id=tx.provider_tx_id,
        status=tx.status,
        amount=tx.amount,
        currency=tx.currency,
        payer_msisdn=tx.payer_msisdn,
        failure_reason=tx.failure_reason,
        aggregator_fee=tx.aggregator_fee,
        bloomar_commission=tx.bloomar_commission,
        restaurant_net=tx.restaurant_net,
        webhook_received_at=tx.webhook_received_at,
        created_at=tx.created_at,
        updated_at=tx.updated_at,
    )


async def _broadcast(tx: PaymentTransaction, event_name: str) -> None:
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


def _load_payable_order(db: Session, order_id: str, restaurant_id: str) -> CustomerOrder:
    order = (
        db.query(CustomerOrder)
        .filter(CustomerOrder.id == order_id, CustomerOrder.restaurant_id == restaurant_id)
        .with_for_update()
        .one_or_none()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Commande introuvable")
    if order.status in {"Payée", "Payee"}:
        raise HTTPException(status_code=400, detail="Cette commande est déjà payée")
    if float(order.total_amount or 0) <= 0:
        raise HTTPException(status_code=400, detail="Montant invalide")
    return order


async def _initiate(
    *,
    provider: str,
    payload,
    request: Request,
    current_user: User,
    db: Session,
) -> tuple[PaymentTransaction, dict]:
    order = _load_payable_order(db, payload.order_id, current_user.restaurant_id)
    try:
        tx = create_pending_transaction(
            db,
            order,
            provider,
            payload.payer_msisdn,
            current_user.id,
            current_user.role.value,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    await _broadcast(tx, "payment_method_selected")
    try:
        if provider == "ORANGE_CM":
            result = await initiate_orange_cashin(
                amount=int(tx.amount),
                payer_msisdn=payload.payer_msisdn,
                order_ref=tx.id,
                description=f"Commande {order.order_number}",
                notify_url=_build_notify_url(request, "orange"),
            )
            parsed_status = parse_orange_status(result)
        else:
            result = await initiate_mtn_cashin(
                amount=int(tx.amount),
                payer_msisdn=payload.payer_msisdn,
                order_ref=tx.id,
                description=f"Commande {order.order_number}",
                notify_url=_build_notify_url(request, "mtn"),
            )
            parsed_status = parse_mtn_status(result)
    except (OrangePaymentError, MtnPaymentError) as exc:
        mark_push_failure(db, tx, str(exc), getattr(exc, "raw", ""))
        await _broadcast(tx, "payment_failed")
        raise HTTPException(status_code=502, detail=f"Erreur Mobile Money : {exc}") from exc
    except Exception as exc:
        mark_push_failure(db, tx, str(exc))
        await _broadcast(tx, "payment_failed")
        logger.exception("Erreur inattendue pendant l'initiation Mobile Money")
        raise HTTPException(
            status_code=502,
            detail="Erreur inattendue lors de l'initiation du paiement",
        ) from exc

    record_push_response(db, tx, result, parsed_status)
    db.refresh(tx)
    if tx.status == "PENDING":
        await _broadcast(tx, "payment_pending")
    else:
        await _broadcast(tx, "payment_failed")
    return tx, result


@router.post("/orange/initiate", response_model=OrangePayInitOut, status_code=201)
async def initiate_orange_payment(
    payload: OrangePayInitIn,
    request: Request,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_permission(current_user, Permission.CASHIER_UPDATE)
    if not is_orange_configured():
        raise HTTPException(status_code=503, detail="Paiement Orange Money non configuré")
    tx, result = await _initiate(
        provider="ORANGE_CM",
        payload=payload,
        request=request,
        current_user=current_user,
        db=db,
    )
    return OrangePayInitOut(
        transaction_id=tx.id,
        pay_token=tx.pay_token or "",
        payment_url=result.get("payment_url"),
        status=tx.status,
        message=(
            "Demande envoyée. La facture est verrouillée jusqu'au webhook de confirmation."
            if tx.status == "PENDING"
            else tx.failure_reason or "Échec du paiement"
        ),
    )


@router.post("/mtn/initiate", response_model=MtnPayInitOut, status_code=201)
async def initiate_mtn_payment(
    payload: MtnPayInitIn,
    request: Request,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_permission(current_user, Permission.CASHIER_UPDATE)
    if not is_mtn_configured():
        raise HTTPException(status_code=503, detail="Paiement MTN Mobile Money non configuré")
    tx, result = await _initiate(
        provider="MTN_CM",
        payload=payload,
        request=request,
        current_user=current_user,
        db=db,
    )
    return MtnPayInitOut(
        transaction_id=tx.id,
        pay_token=tx.pay_token or "",
        payment_url=result.get("payment_url"),
        status=tx.status,
        message=(
            "Demande envoyée. La facture est verrouillée jusqu'au webhook de confirmation."
            if tx.status == "PENDING"
            else tx.failure_reason or "Échec du paiement"
        ),
    )


@router.get("/{provider}/status/{transaction_id}", response_model=PaymentStatusOut)
def get_payment_status(
    provider: str,
    transaction_id: str,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_permission(current_user, Permission.CASHIER_READ)
    expected_provider = {"orange": "ORANGE_CM", "mtn": "MTN_CM"}.get(provider.lower())
    if not expected_provider:
        raise HTTPException(status_code=404, detail="Opérateur inconnu")
    # Chargement scope tenant: jamais de db.get() nu sur une entite metier.
    tx = tenant_get_or_404(
        db,
        PaymentTransaction,
        transaction_id,
        current_user.restaurant_id,
        detail="Transaction introuvable",
    )
    if tx.provider != expected_provider:
        raise HTTPException(status_code=404, detail="Transaction introuvable")
    # Lecture base uniquement: cette route ne peut jamais valider un paiement.
    return _status_out(tx)


def _allowed_source(request: Request, provider: str) -> bool:
    raw_allowlist = os.getenv(f"{provider}_WEBHOOK_ALLOWED_IPS", "").strip()
    if not raw_allowlist:
        return True
    source = request.client.host if request.client else ""
    try:
        address = ipaddress.ip_address(source)
        return any(
            address in ipaddress.ip_network(item.strip(), strict=False)
            for item in raw_allowlist.split(",")
            if item.strip()
        )
    except ValueError:
        return False


async def _process_webhook(
    request: Request,
    db: Session,
    provider: str,
    secret: str,
    parse_status,
) -> dict:
    if not secret:
        raise HTTPException(status_code=503, detail="Secret webhook non configuré")
    if not _allowed_source(request, provider):
        raise HTTPException(status_code=403, detail="Provenance webhook non autorisée")
    raw_body = await request.body()
    signature = (
        request.headers.get("x-webhook-signature")
        or request.headers.get("x-signature")
        or request.headers.get("x-hub-signature-256")
        or ""
    )
    if not verify_hmac_sha256_signature(raw_body, signature, secret):
        raise HTTPException(status_code=401, detail="Signature webhook invalide")
    try:
        body = json.loads(raw_body or b"{}")
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Payload webhook invalide") from exc

    provider_code = f"{provider}_CM"
    tx = find_transaction(db, provider_code, body)
    if not tx:
        logger.warning("%s webhook: transaction inconnue", provider)
        return {"received": True, "matched": False}

    changed = apply_webhook(db, tx, body, parse_status(body))
    db.refresh(tx)
    if changed:
        event = "payment_success" if tx.status == "SUCCESS" else (
            "payment_failed" if tx.status in {"FAILED", "CANCELLED", "EXPIRED"} else "payment_pending"
        )
        await _broadcast(tx, event)
    return {"received": True, "matched": True}


@router.post("/orange/webhook")
async def orange_webhook(request: Request, db: Session = Depends(get_db)):
    return await _process_webhook(
        request,
        db,
        "ORANGE",
        get_orange_config()["webhook_secret"],
        parse_orange_status,
    )


@router.post("/mtn/webhook")
async def mtn_webhook(request: Request, db: Session = Depends(get_db)):
    return await _process_webhook(
        request,
        db,
        "MTN",
        get_mtn_config()["webhook_secret"],
        parse_mtn_status,
    )


@router.get("/transactions", response_model=list[PaymentStatusOut])
def list_transactions(
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    status: str | None = Query(default=None),
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_permission(current_user, Permission.ACCOUNTING_READ)
    end = end_date or datetime.utcnow()
    start = start_date or end - timedelta(days=30)
    query = db.query(PaymentTransaction).filter(
        PaymentTransaction.restaurant_id == current_user.restaurant_id,
        PaymentTransaction.created_at >= start,
        PaymentTransaction.created_at <= end,
    )
    if status:
        query = query.filter(PaymentTransaction.status == status.upper())
    return [_status_out(tx) for tx in query.order_by(PaymentTransaction.created_at.desc()).limit(200)]


@router.websocket("/ws")
async def payment_websocket(websocket: WebSocket, token: str = Query(default="")):
    payload = decode_access_token(token)
    user_id = payload.get("sub") if payload else None
    db = SessionLocal()
    try:
        user = db.get(User, user_id) if user_id else None
        token_revoked = user is not None and int(payload.get("ver", 0)) != int(
            getattr(user, "token_version", 0) or 0
        )
        if not user or not user.is_active or not user.restaurant_id or token_revoked:
            await websocket.close(code=4401)
            return
        restaurant_id = user.restaurant_id
    finally:
        db.close()

    await payment_connections.connect(restaurant_id, websocket)
    try:
        await websocket.send_json({"event": "payment_stream_ready"})
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await payment_connections.disconnect(restaurant_id, websocket)
