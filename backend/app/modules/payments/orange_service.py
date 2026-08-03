"""
Service d'intégration Orange Money Cameroun via l'API Y-Note / Paynote.

Documentation : https://www.y-note.cm/integration-de-lapi-local-orange-money/
Endpoint prod : https://api-s1.orange.cm/

Flux USSD :
  1. POST /token          → access_token
  2. POST /mp/init        → payToken
  3. POST /mp/pay         → push USSD (orderId, notifUrl, …)

Toutes les credentials sont lues depuis les variables d'environnement —
elles ne doivent JAMAIS apparaître dans le code source.
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Optional
from urllib.parse import urlparse

import httpx

logger = logging.getLogger(__name__)


def _cfg(key: str, default: str = "") -> str:
    return os.getenv(key, default).strip()


def get_orange_config() -> dict:
    return {
        "base_url": _cfg("ORANGE_API_URL", "https://api-s1.orange.cm").rstrip("/"),
        "username": _cfg("ORANGE_USERNAME"),
        "password": _cfg("ORANGE_PASSWORD"),
        "channel_msisdn": _cfg("ORANGE_CHANNEL_MSISDN"),
        "pin": _cfg("ORANGE_PIN"),
        "x_auth_token": _cfg("ORANGE_X_AUTH_TOKEN"),
        "webhook_secret": _cfg("ORANGE_WEBHOOK_SECRET", ""),
    }


def is_orange_configured() -> bool:
    cfg = get_orange_config()
    return bool(cfg["username"] and cfg["password"] and cfg["channel_msisdn"] and cfg["pin"] and cfg["x_auth_token"])


def normalize_cm_msisdn(msisdn: str) -> str:
    """Normalise un numéro camerounais (9 chiffres, sans +237 / 0 initial)."""
    digits = re.sub(r"\D", "", str(msisdn or ""))
    if digits.startswith("237") and len(digits) >= 12:
        digits = digits[3:]
    if len(digits) == 10 and digits.startswith("0"):
        digits = digits[1:]
    return digits


def require_public_notify_url(notify_url: Optional[str]) -> str:
    """Orange exige une NotifUrl publique non vide (HTTPS recommandé)."""
    url = (notify_url or "").strip()
    if not url:
        raise OrangePaymentError(
            "URL de notification manquante. Définissez APP_PUBLIC_URL "
            "(ex. https://restaurant.bloomarone.com) dans le .env du serveur."
        )
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise OrangePaymentError(f"URL de notification invalide: {url}")
    host = (parsed.hostname or "").lower()
    if host in {"localhost", "127.0.0.1", "0.0.0.0"} or host.endswith(".local"):
        raise OrangePaymentError(
            "APP_PUBLIC_URL doit être une URL publique (pas localhost) pour Orange Money."
        )
    return url


def _auth_headers(cfg: dict, token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "X-AUTH-TOKEN": cfg["x_auth_token"],
        "Content-Type": "application/json",
    }


def _flatten_orange_payload(data: dict) -> dict:
    """Aplatit {message, data:{...}} pour le reste du module paiements."""
    if not isinstance(data, dict):
        return {"raw": data}
    nested = data.get("data")
    if isinstance(nested, dict):
        flat = {**nested}
        if data.get("message") and "message" not in flat:
            flat["message"] = data["message"]
        return flat
    return data


# ─── Étape 1 : obtenir un access token OAuth2 ────────────────────────────────

async def fetch_access_token(cfg: dict) -> str:
    """
    POST /token
    Basic auth avec username:password.
    Retourne le bearer token.
    """
    url = f"{cfg['base_url']}/token"
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            url,
            data={"grant_type": "client_credentials"},
            auth=(cfg["username"], cfg["password"]),
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        response.raise_for_status()
        data = response.json()
        token = data.get("access_token")
        if not token:
            raise ValueError(f"Pas d'access_token dans la réponse Orange: {data}")
        return token


# ─── Étape 2 : initialiser le paiement (payToken) ────────────────────────────

async def fetch_pay_token(cfg: dict, token: str) -> str:
    """POST /omcoreapis/1.0.2/mp/init → payToken."""
    url = f"{cfg['base_url']}/omcoreapis/1.0.2/mp/init"
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(url, headers=_auth_headers(cfg, token))
        raw = response.text
        try:
            data = response.json()
        except Exception:
            data = {"raw": raw, "status_code": response.status_code}

        if response.status_code not in (200, 201, 202):
            error_msg = data.get("message") or data.get("error") or raw[:200]
            raise OrangePaymentError(f"Erreur Orange Money init ({response.status_code}): {error_msg}", raw=raw)

        flat = _flatten_orange_payload(data)
        pay_token = flat.get("payToken") or flat.get("pay_token")
        if not pay_token:
            raise OrangePaymentError("Réponse Orange init sans payToken", raw=raw)
        return str(pay_token)


# ─── Étape 3 : initier le paiement (cashin USSD) ─────────────────────────────

async def initiate_cashin(
    amount: int,
    payer_msisdn: str,
    order_ref: str,
    description: str = "Paiement Bloomar One",
    notify_url: Optional[str] = None,
) -> dict:
    """
    Initie un paiement Orange Money (appel de fonds USSD push).

    Paramètres :
        amount        : montant en FCFA (entier)
        payer_msisdn  : numéro Orange du client (ex: 690000000)
        order_ref     : référence unique de commande / transaction
        notify_url    : URL webhook de confirmation (obligatoire côté Orange)
    """
    cfg = get_orange_config()
    notif_url = require_public_notify_url(notify_url)
    order_id = str(order_ref or "").strip()
    if not order_id:
        raise OrangePaymentError("OrderId manquant pour Orange Money.")

    subscriber = normalize_cm_msisdn(payer_msisdn)
    if len(subscriber) != 9 or not subscriber.startswith("6"):
        raise OrangePaymentError(
            f"Numéro Orange invalide ({payer_msisdn}). Format attendu : 6XXXXXXXX."
        )

    token = await fetch_access_token(cfg)
    pay_token = await fetch_pay_token(cfg, token)

    url = f"{cfg['base_url']}/omcoreapis/1.0.2/mp/pay"
    # Noms camelCase exigés par l'API Orange CM (OrderId / NotifUrl côté serveur).
    payload = {
        "notifUrl": notif_url,
        "channelUserMsisdn": normalize_cm_msisdn(cfg["channel_msisdn"]),
        "amount": str(int(amount)),
        "subscriberMsisdn": subscriber,
        "pin": cfg["pin"],
        "orderId": order_id,
        "description": (description or "Paiement Bloomar One")[:255],
        "payToken": pay_token,
    }

    logger.info(
        "Orange Money cashin request: order=%s amount=%s payer=%s notif=%s",
        order_id,
        amount,
        subscriber,
        notif_url,
    )

    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(url, json=payload, headers=_auth_headers(cfg, token))
        raw = response.text
        logger.debug("Orange Money raw response [%s]: %s", response.status_code, raw[:500])

        try:
            data = response.json()
        except Exception:
            data = {"raw": raw, "status_code": response.status_code}

        if response.status_code not in (200, 201, 202):
            error_msg = data.get("message") or data.get("title") or data.get("error") or raw[:300]
            if isinstance(data.get("errors"), dict):
                error_msg = f"{error_msg} {json.dumps(data['errors'], ensure_ascii=False)}"
            raise OrangePaymentError(f"Erreur Orange Money ({response.status_code}): {error_msg}", raw=raw)

        flat = _flatten_orange_payload(data)
        # Garantir que le payToken de l'init est conservé si absente de la réponse pay.
        flat.setdefault("payToken", pay_token)
        flat.setdefault("orderId", order_id)
        flat.setdefault("notifUrl", notif_url)
        return flat


# ─── Étape 4 : vérifier le statut d'une transaction ──────────────────────────

async def check_transaction_status(pay_token: str) -> dict:
    """
    Interroge l'API Orange pour connaître le statut d'un paiement.
    Utilise le pay_token retourné lors de l'initiation.
    """
    cfg = get_orange_config()
    token = await fetch_access_token(cfg)

    url = f"{cfg['base_url']}/omcoreapis/1.0.2/mp/paymentstatus/{pay_token}"

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(url, headers=_auth_headers(cfg, token))
        response.raise_for_status()
        return _flatten_orange_payload(response.json())


# ─── Helpers ─────────────────────────────────────────────────────────────────

def parse_orange_status(raw_data: dict) -> str:
    """
    Traduit la réponse Orange en statut interne :
    SUCCESS | PENDING | FAILED | CANCELLED | EXPIRED
    """
    data: dict[str, Any] = raw_data if isinstance(raw_data, dict) else {}
    nested = data.get("data")
    if isinstance(nested, dict):
        data = {**data, **nested}

    status = (data.get("status") or data.get("paymentStatus") or "").upper()
    message = (data.get("message") or data.get("inittxnmessage") or "").upper()

    if status in {"SUCCESSFULL", "SUCCESSFUL", "SUCCESS"} or "SUCCESS" in message:
        return "SUCCESS"
    if status in {"EXPIRED"}:
        return "EXPIRED"
    if status in {"CANCELLED", "CANCELED"}:
        return "CANCELLED"
    if status in {"FAILED", "FAILURE", "ERROR"}:
        return "FAILED"
    # INITIATED / PENDING / vide → on attend
    return "PENDING"


def safe_json(data: dict, max_len: int = 2000) -> str:
    """Sérialise un dict en JSON tronqué pour la colonne raw_response."""
    try:
        return json.dumps(data, ensure_ascii=False)[:max_len]
    except Exception:
        return str(data)[:max_len]


class OrangePaymentError(Exception):
    def __init__(self, message: str, raw: str = ""):
        super().__init__(message)
        self.raw = raw
