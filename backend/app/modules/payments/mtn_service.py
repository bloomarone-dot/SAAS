"""
Service d'intégration MTN Mobile Money Cameroun via l'API Y-Note / Paynote.

Documentation : https://www.paynote.africa/documentation-paynote.html
Credentials fournis par Y-Note pour AREA GROUP PLUS SARL.
Toutes les credentials sont lues depuis les variables d'environnement —
elles ne doivent JAMAIS apparaître dans le code source.
"""

import json
import logging
import os
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# ─── Config (injectée via variables d'environnement) ──────────────────────────
# Variables requises :
# MTN_API_URL, MTN_CUSTOMER_KEY, MTN_CUSTOMER_SECRET
# MTN_CLIENT_ID, MTN_CLIENT_SECRET, MTN_CHANNEL_MSISDN, MTN_PIN

def _cfg(key: str, default: str = "") -> str:
    return os.getenv(key, default).strip()


def get_mtn_config() -> dict:
    return {
        "base_url": _cfg("MTN_API_URL", "https://api-s1.orange.cm"),
        "customer_key": _cfg("MTN_CUSTOMER_KEY"),
        "customer_secret": _cfg("MTN_CUSTOMER_SECRET"),
        "client_id": _cfg("MTN_CLIENT_ID"),
        "client_secret": _cfg("MTN_CLIENT_SECRET"),
        "channel_msisdn": _cfg("MTN_CHANNEL_MSISDN"),
        "pin": _cfg("MTN_PIN"),
        "x_auth_token": _cfg("MTN_X_AUTH_TOKEN"),
        "webhook_secret": _cfg("MTN_WEBHOOK_SECRET", ""),
    }


def is_mtn_configured() -> bool:
    cfg = get_mtn_config()
    return bool(cfg["customer_key"] and cfg["customer_secret"] and cfg["channel_msisdn"] and cfg["pin"])


# ─── Étape 1 : obtenir un access token OAuth2 ────────────────────────────────

async def fetch_access_token(cfg: dict) -> str:
    """
    POST /token
    Authentification avec client_id:client_secret encodé en base64.
    Retourne le bearer token.
    """
    url = f"{cfg['base_url']}/token"
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            url,
            data={"grant_type": "client_credentials"},
            auth=(cfg["customer_key"], cfg["customer_secret"]),
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        response.raise_for_status()
        data = response.json()
        token = data.get("access_token")
        if not token:
            raise ValueError(f"Pas d'access_token dans la réponse MTN: {data}")
        return token


# ─── Étape 2 : initier le paiement (cashin) ──────────────────────────────────

async def initiate_cashin(
    amount: int,
    payer_msisdn: str,
    order_ref: str,
    description: str = "Paiement MTN Money",
    notify_url: Optional[str] = None,
) -> dict:
    """
    Initie un paiement MTN Mobile Money (appel de fonds USSD push).

    Paramètres :
        amount        : montant en FCFA (entier)
        payer_msisdn  : numéro MTN du client (ex: 670000000)
        order_ref     : référence unique de commande
        notify_url    : URL webhook de confirmation (optionnel)

    Retourne le dict de réponse MTN contenant pay_token, status, etc.
    """
    cfg = get_mtn_config()
    token = await fetch_access_token(cfg)

    url = f"{cfg['base_url']}/mtn/money/pay"

    headers = {
        "Authorization": f"Bearer {token}",
        "X-AUTH-TOKEN": cfg["x_auth_token"],
        "Content-Type": "application/json",
    }

    payload = {
        "merchant_key": cfg["x_auth_token"],
        "currency": "XAF",
        "order_id": order_ref,
        "amount": int(amount),
        "return_url": notify_url or "",
        "cancel_url": notify_url or "",
        "notif_url": notify_url or "",
        "lang": "fr",
        "reference": order_ref,
        "channelUserMsisdn": cfg["channel_msisdn"],
        "pin": cfg["pin"],
        "subscriberMsisdn": payer_msisdn.lstrip("0").lstrip("+237").lstrip("237"),
        "description": description,
    }

    logger.info("MTN Money cashin request: order=%s amount=%s payer=%s", order_ref, amount, payer_msisdn)

    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(url, json=payload, headers=headers)
        raw = response.text
        logger.debug("MTN Money raw response [%s]: %s", response.status_code, raw[:500])

        try:
            data = response.json()
        except Exception:
            data = {"raw": raw, "status_code": response.status_code}

        if response.status_code not in (200, 201, 202):
            error_msg = data.get("message") or data.get("error") or raw[:200]
            raise MtnPaymentError(f"Erreur MTN Money ({response.status_code}): {error_msg}", raw=raw)

        return data


# ─── Étape 3 : vérifier le statut d'une transaction ──────────────────────────

async def check_transaction_status(pay_token: str) -> dict:
    """
    Interroge l'API MTN pour connaître le statut d'un paiement.
    Utilise le pay_token retourné lors de l'initiation.
    """
    cfg = get_mtn_config()
    token = await fetch_access_token(cfg)

    url = f"{cfg['base_url']}/mtn/money/paymentstatus/{pay_token}"

    headers = {
        "Authorization": f"Bearer {token}",
        "X-AUTH-TOKEN": cfg["x_auth_token"],
    }

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(url, headers=headers)
        response.raise_for_status()
        return response.json()


# ─── Helpers ─────────────────────────────────────────────────────────────────

def parse_mtn_status(raw_data: dict) -> str:
    """
    Traduit la réponse MTN en statut interne :
    SUCCESS | PENDING | FAILED | CANCELLED | EXPIRED
    """
    status = (raw_data.get("status") or raw_data.get("paymentStatus") or "").upper()
    message = (raw_data.get("message") or "").upper()

    if status in {"SUCCESSFULL", "SUCCESS", "SUCCESSFUL"} or "SUCCESS" in message:
        return "SUCCESS"
    if status in {"EXPIRED"}:
        return "EXPIRED"
    if status in {"CANCELLED", "CANCELED"}:
        return "CANCELLED"
    if status in {"FAILED", "FAILURE", "ERROR"}:
        return "FAILED"
    return "PENDING"


def safe_json(data: dict, max_len: int = 2000) -> str:
    """Sérialise un dict en JSON tronqué pour la colonne raw_response."""
    try:
        return json.dumps(data, ensure_ascii=False)[:max_len]
    except Exception:
        return str(data)[:max_len]


class MtnPaymentError(Exception):
    def __init__(self, message: str, raw: str = ""):
        super().__init__(message)
        self.raw = raw