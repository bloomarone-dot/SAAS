from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator, model_validator


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
    aggregator_fee: Optional[float] = None
    bloomar_commission: Optional[float] = None
    restaurant_net: Optional[float] = None
    webhook_received_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class OrangeWebhookIn(BaseModel):
    """Payload reçu du webhook Orange Money / Y-Note."""
    model_config = {"extra": "allow"}

    status: Optional[str] = None
    txnid: Optional[str] = None
    pay_token: Optional[str] = None
    notifToken: Optional[str] = None
    message: Optional[str] = None


class MtnPayInitIn(BaseModel):
    """Payload pour initier un paiement MTN Money."""
    order_id: str = Field(description="ID de la commande à payer")
    payer_msisdn: str = Field(
        min_length=8,
        max_length=20,
        description="Numéro MTN Money du client (ex: 670000000)",
    )


class MtnPayInitOut(BaseModel):
    """Réponse après initiation du paiement."""
    transaction_id: str
    pay_token: str
    payment_url: Optional[str] = None
    ussd_code: Optional[str] = None
    status: str
    message: str


class MtnWebhookIn(BaseModel):
    """Payload reçu du webhook MTN Money / Y-Note."""
    model_config = {"extra": "allow"}

    status: Optional[str] = None
    txnid: Optional[str] = None
    pay_token: Optional[str] = None
    notifToken: Optional[str] = None
    message: Optional[str] = None


# --- Demandes de paiement (serveur -> caisse) ---

PAYMENT_REQUEST_METHODS = {"ORANGE", "MTN", "CASH"}


class PaymentRequestCreateIn(BaseModel):
    """Demande saisie par le serveur depuis une commande finalisée."""
    order_id: str = Field(description="ID de la commande à encaisser")
    method: str = Field(description="Mode de paiement: ORANGE | MTN | CASH")
    payer_msisdn: Optional[str] = Field(default=None, max_length=20, description="Numéro Mobile Money du client")
    note: Optional[str] = Field(default=None, max_length=255)

    @field_validator("method")
    @classmethod
    def _check_method(cls, value: str) -> str:
        normalized = (value or "").strip().upper()
        if normalized not in PAYMENT_REQUEST_METHODS:
            raise ValueError("Mode de paiement invalide")
        return normalized

    @model_validator(mode="after")
    def _check_msisdn(self) -> "PaymentRequestCreateIn":
        if self.method in {"ORANGE", "MTN"}:
            cleaned = (self.payer_msisdn or "").strip()
            if len(cleaned) < 8:
                raise ValueError("Le numéro Mobile Money du client est requis")
        return self


class PaymentRequestOut(BaseModel):
    id: str
    order_id: str
    order_number: Optional[str] = None
    method: str
    payer_msisdn: Optional[str] = None
    amount: float
    status: str
    note: Optional[str] = None
    requested_by_name: Optional[str] = None
    validated_by_id: Optional[str] = None
    transaction_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class PaymentRequestActionOut(BaseModel):
    request_id: str
    status: str
    transaction_id: Optional[str] = None
    message: str
