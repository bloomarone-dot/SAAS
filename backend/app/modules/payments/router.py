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
from sqlalchemy.exc import IntegrityError

from app.modules.orders.models import CustomerOrder
from app.modules.orders.router import settle_cash_payment
from app.modules.payments.models import PaymentRequest, PaymentTransaction, PaymentWebhookEvent
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
    PaymentRequestActionOut,
    PaymentRequestCreateIn,
    PaymentRequestOut,
    PaymentStatusOut,
)
from app.modules.payments.service import (
    apply_webhook,
    create_payment_request,
    create_pending_transaction,
    find_transaction,
    list_payment_requests,
    mark_push_failure,
    notify_request_owner,
    record_push_response,
    reject_payment_request,
    REQUESTABLE_STATUSES,
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
    order_id: str,
    payer_msisdn: str,
    request: Request,
    current_user: User,
    db: Session,
) -> tuple[PaymentTransaction, dict]:
    order = _load_payable_order(db, order_id, current_user.restaurant_id)
    try:
        tx = create_pending_transaction(
            db,
            order,
            provider,
            payer_msisdn,
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
                payer_msisdn=payer_msisdn,
                order_ref=tx.id,
                description=f"Commande {order.order_number}",
                notify_url=_build_notify_url(request, "orange"),
            )
            parsed_status = parse_orange_status(result)
        else:
            result = await initiate_mtn_cashin(
                amount=int(tx.amount),
                payer_msisdn=payer_msisdn,
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
        order_id=payload.order_id,
        payer_msisdn=payload.payer_msisdn,
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
        order_id=payload.order_id,
        payer_msisdn=payload.payer_msisdn,
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

    parsed_status = parse_status(body)

    # Verrou pessimiste : sérialise les webhooks concurrents sur la même transaction.
    tx = (
        db.query(PaymentTransaction)
        .filter(PaymentTransaction.id == tx.id)
        .with_for_update()
        .one()
    )

    # Idempotence DB : clé = référence + statut. Deux webhooks SUCCESS de même
    # référence collisionnent (rejet), mais PENDING puis SUCCESS restent distincts.
    reference = (
        body.get("txnid")
        or body.get("transaction_id")
        or body.get("pay_token")
        or body.get("payToken")
        or tx.id
    )
    dedup_key = f"{reference}:{parsed_status}"
    db.add(
        PaymentWebhookEvent(
            restaurant_id=tx.restaurant_id,
            transaction_id=tx.id,
            provider=provider_code,
            provider_tx_id=body.get("txnid") or body.get("transaction_id"),
            dedup_key=str(dedup_key)[:180],
            status=parsed_status,
            signature_valid=True,
            raw_payload=json.dumps(body, ensure_ascii=False, default=str)[:4000],
        )
    )
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        logger.info("%s webhook: événement déjà traité (dedup_key=%s)", provider, dedup_key)
        return {"received": True, "matched": True, "duplicate": True}

    changed = apply_webhook(db, tx, body, parsed_status)
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


# --- Demandes de paiement serveur -> caisse ---

_METHOD_PROVIDER = {"ORANGE": "ORANGE_CM", "MTN": "MTN_CM"}


def _order_numbers(db: Session, order_ids: list[str]) -> dict[str, str]:
    if not order_ids:
        return {}
    rows = (
        db.query(CustomerOrder.id, CustomerOrder.order_number)
        .filter(CustomerOrder.id.in_(set(order_ids)))
        .all()
    )
    return {row[0]: row[1] for row in rows}


def _request_out(request_obj: PaymentRequest, order_number: str | None) -> PaymentRequestOut:
    return PaymentRequestOut(
        id=request_obj.id,
        order_id=request_obj.order_id,
        order_number=order_number,
        method=request_obj.method,
        payer_msisdn=request_obj.payer_msisdn,
        amount=request_obj.amount,
        status=request_obj.status,
        note=request_obj.note,
        requested_by_name=request_obj.requested_by_name,
        validated_by_id=request_obj.validated_by_id,
        transaction_id=request_obj.transaction_id,
        created_at=request_obj.created_at,
        updated_at=request_obj.updated_at,
    )


async def _broadcast_request(request_obj: PaymentRequest, event_name: str) -> None:
    await payment_connections.broadcast(
        request_obj.restaurant_id,
        {
            "event": event_name,
            "request_id": request_obj.id,
            "order_id": request_obj.order_id,
            "method": request_obj.method,
            "status": request_obj.status,
            "amount": request_obj.amount,
        },
    )


@router.post("/requests", response_model=PaymentRequestOut, status_code=201)
async def create_payment_request_endpoint(
    payload: PaymentRequestCreateIn,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_permission(current_user, Permission.SERVICE_UPDATE)
    order = tenant_get_or_404(
        db, CustomerOrder, payload.order_id, current_user.restaurant_id, detail="Commande introuvable"
    )
    try:
        request_obj = create_payment_request(
            db, order, payload.method, payload.payer_msisdn, payload.note, current_user
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    await _broadcast_request(request_obj, "payment_request_created")
    return _request_out(request_obj, order.order_number)


@router.get("/requests", response_model=list[PaymentRequestOut])
def list_payment_requests_endpoint(
    status: str | None = Query(default="PENDING"),
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_permission(current_user, Permission.CASHIER_READ)
    requests = list_payment_requests(db, current_user.restaurant_id, status)
    numbers = _order_numbers(db, [req.order_id for req in requests])
    return [_request_out(req, numbers.get(req.order_id)) for req in requests]


def _load_pending_request(db: Session, request_id: str, restaurant_id: str) -> PaymentRequest:
    request_obj = tenant_get_or_404(
        db, PaymentRequest, request_id, restaurant_id, detail="Demande introuvable"
    )
    if request_obj.status != "PENDING":
        raise HTTPException(status_code=409, detail="Cette demande a déjà été traitée")
    return request_obj


@router.post("/requests/{request_id}/validate", response_model=PaymentRequestActionOut)
async def validate_payment_request_endpoint(
    request_id: str,
    request: Request,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_permission(current_user, Permission.CASHIER_UPDATE)
    request_obj = _load_pending_request(db, request_id, current_user.restaurant_id)
    order = tenant_get_or_404(
        db, CustomerOrder, request_obj.order_id, current_user.restaurant_id, detail="Commande introuvable"
    )

    if request_obj.method == "CASH":
        if order.status in {"Payée", "Payee"}:
            raise HTTPException(status_code=400, detail="Cette commande est déjà payée")
        if order.payment_locked or order.status == "PENDING_PAYMENT":
            raise HTTPException(status_code=409, detail="Facture verrouillée par un paiement Mobile Money actif")
        if not getattr(order, "is_closed", False) and order.status not in REQUESTABLE_STATUSES:
            raise HTTPException(status_code=400, detail="La caisse ne peut encaisser que les commandes fermées, prêtes, servies ou livrées")
        settle_cash_payment(db, order, current_user, "Espèces")
        request_obj.status = "VALIDATED"
        request_obj.validated_by_id = current_user.id
        notify_request_owner(
            db, request_obj, order.order_number,
            "Paiement encaissé",
            f"La caisse a encaissé la commande {order.order_number} en espèces.",
        )
        db.commit()
        await _broadcast_request(request_obj, "payment_request_validated")
        return PaymentRequestActionOut(
            request_id=request_obj.id,
            status="VALIDATED",
            message="Encaissement espèces validé.",
        )

    provider = _METHOD_PROVIDER[request_obj.method]
    if provider == "ORANGE_CM" and not is_orange_configured():
        raise HTTPException(status_code=503, detail="Paiement Orange Money non configuré")
    if provider == "MTN_CM" and not is_mtn_configured():
        raise HTTPException(status_code=503, detail="Paiement MTN Mobile Money non configuré")

    tx, _result = await _initiate(
        provider=provider,
        order_id=request_obj.order_id,
        payer_msisdn=request_obj.payer_msisdn,
        request=request,
        current_user=current_user,
        db=db,
    )
    request_obj.status = "VALIDATED"
    request_obj.validated_by_id = current_user.id
    request_obj.transaction_id = tx.id
    notify_request_owner(
        db, request_obj, order.order_number,
        "Paiement lancé",
        f"La caisse a lancé le paiement {request_obj.method} de la commande {order.order_number}. "
        "Le client reçoit la demande de confirmation.",
    )
    db.commit()
    await _broadcast_request(request_obj, "payment_request_validated")
    return PaymentRequestActionOut(
        request_id=request_obj.id,
        status=tx.status,
        transaction_id=tx.id,
        message=(
            "Push envoyé au client. En attente de confirmation."
            if tx.status == "PENDING"
            else tx.failure_reason or "Échec du paiement"
        ),
    )


@router.post("/requests/{request_id}/reject", response_model=PaymentRequestActionOut)
async def reject_payment_request_endpoint(
    request_id: str,
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_permission(current_user, Permission.CASHIER_UPDATE)
    request_obj = _load_pending_request(db, request_id, current_user.restaurant_id)
    order = db.get(CustomerOrder, request_obj.order_id)
    reject_payment_request(db, request_obj, current_user, order.order_number if order else "")
    await _broadcast_request(request_obj, "payment_request_rejected")
    return PaymentRequestActionOut(
        request_id=request_obj.id,
        status="REJECTED",
        message="Demande de paiement rejetée.",
    )


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
