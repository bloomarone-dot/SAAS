"""
Service d'intégration Orange Money Cameroun via l'API Y-Note / Paynote.

Documentation : https://www.paynote.africa/documentation-paynote.html
Endpoint prod : https://api-s1.orange.cm/

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

def _cfg(key: str, default: str = "") -> str:
    return os.getenv(key, default).strip()


def get_orange_config() -> dict:
    return {
        "base_url": _cfg("ORANGE_API_URL", "https://api-s1.orange.cm"),
        "username": _cfg("ORANGE_USERNAME"),
        "password": _cfg("ORANGE_PASSWORD"),
        "channel_msisdn": _cfg("ORANGE_CHANNEL_MSISDN"),
        "pin": _cfg("ORANGE_PIN"),
        "x_auth_token": _cfg("ORANGE_X_AUTH_TOKEN"),
        "webhook_secret": _cfg("ORANGE_WEBHOOK_SECRET", ""),
    }


def is_orange_configured() -> bool:
    cfg = get_orange_config()
    return bool(cfg["username"] and cfg["password"] and cfg["channel_msisdn"] and cfg["pin"])


# ─── Étape 1 : obtenir un access token OAuth2 ────────────────────────────────

async def fetch_access_token(cfg: dict) -> str:
    """
    POST /token
    Basic auth avec username:password encodé en base64.
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


# ─── Étape 2 : initier le paiement (cashin) ──────────────────────────────────

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
        order_ref     : référence unique de commande
        notify_url    : URL webhook de confirmation (optionnel)

    Retourne le dict de réponse Orange contenant pay_token, status, etc.
    """
    cfg = get_orange_config()
    token = await fetch_access_token(cfg)

    url = f"{cfg['base_url']}/omcoreapis/1.0.2/mp/pay"

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
        # Champs spécifiques appel de fonds USSD
        "channelUserMsisdn": cfg["channel_msisdn"],
        "pin": cfg["pin"],
        "subscriberMsisdn": payer_msisdn.lstrip("0").lstrip("+237"),
        "description": description,
    }

    logger.info("Orange Money cashin request: order=%s amount=%s payer=%s", order_ref, amount, payer_msisdn)

    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(url, json=payload, headers=headers)
        raw = response.text
        logger.debug("Orange Money raw response [%s]: %s", response.status_code, raw[:500])

        try:
            data = response.json()
        except Exception:
            data = {"raw": raw, "status_code": response.status_code}

        if response.status_code not in (200, 201, 202):
            error_msg = data.get("message") or data.get("error") or raw[:200]
            raise OrangePaymentError(f"Erreur Orange Money ({response.status_code}): {error_msg}", raw=raw)

        return data


# ─── Étape 3 : vérifier le statut d'une transaction ──────────────────────────

async def check_transaction_status(pay_token: str) -> dict:
    """
    Interroge l'API Orange pour connaître le statut d'un paiement.
    Utilise le pay_token retourné lors de l'initiation.
    """
    cfg = get_orange_config()
    token = await fetch_access_token(cfg)

    url = f"{cfg['base_url']}/omcoreapis/1.0.2/mp/paymentstatus/{pay_token}"

    headers = {
        "Authorization": f"Bearer {token}",
        "X-AUTH-TOKEN": cfg["x_auth_token"],
    }

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(url, headers=headers)
        response.raise_for_status()
        return response.json()


# ─── Helpers ─────────────────────────────────────────────────────────────────

def parse_orange_status(raw_data: dict) -> str:
    """
    Traduit la réponse Orange en statut interne :
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
