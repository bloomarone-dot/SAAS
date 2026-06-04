from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class OrangePayInitIn(BaseModel):
    """Payload pour initier un paiement Orange Money."""
    order_id: str = Field(description="ID de la commande à payer")
    payer_msisdn: str = Field(
        min_length=8,
        max_length=20,
        description="Numéro Orange Money du client (ex: 690000000)",
    )


class OrangePayInitOut(BaseModel):
    """Réponse après initiation du paiement."""
    transaction_id: str
    pay_token: str
    payment_url: Optional[str] = None
    ussd_code: Optional[str] = None
    status: str
    message: str


class PaymentStatusOut(BaseModel):
    """Statut d'une transaction."""
    transaction_id: str
    provider_tx_id: Optional[str] = None
    status: str
    amount: float
    currency: str
    payer_msisdn: Optional[str] = None
    failure_reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class OrangeWebhookIn(BaseModel):
    """Payload reçu du webhook Orange Money / Y-Note."""
    # Y-Note envoie des champs variables selon la version — on accepte tout
    model_config = {"extra": "allow"}

    status: Optional[str] = None
    txnid: Optional[str] = None
    pay_token: Optional[str] = None
    notifToken: Optional[str] = None
    message: Optional[str] = None
