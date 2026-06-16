from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.modules.shared.models import new_id


class PaymentTransaction(Base):
    """Trace chaque tentative de paiement mobile (Orange Money, MTN, etc.)."""

    __tablename__ = "payment_transactions"
    __table_args__ = (UniqueConstraint("active_order_key", name="uq_payment_active_order"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True, nullable=False)
    order_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("customer_orders.id"), index=True, nullable=True)
    active_order_key: Mapped[str | None] = mapped_column(String(36), nullable=True)

    # Identification externe
    provider: Mapped[str] = mapped_column(String(40), default="ORANGE_CM", nullable=False)
    provider_tx_id: Mapped[str | None] = mapped_column(String(120), index=True, nullable=True)
    pay_token: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notif_token: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Montant
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="XAF", nullable=False)
    aggregator_fee: Mapped[float | None] = mapped_column(Float, nullable=True)
    bloomar_commission: Mapped[float | None] = mapped_column(Float, nullable=True)
    restaurant_net: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Numéro payeur
    payer_msisdn: Mapped[str | None] = mapped_column(String(30), nullable=True)

    # Statut : PENDING | SUCCESS | FAILED | CANCELLED | EXPIRED
    status: Mapped[str] = mapped_column(String(30), default="PENDING", nullable=False, index=True)
    failure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Réponse brute du provider (JSON tronqué)
    raw_response: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_webhook: Mapped[str | None] = mapped_column(Text, nullable=True)
    webhook_received_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_reconciled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    reconciliation_status: Mapped[str | None] = mapped_column(String(30), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class PaymentWebhookEvent(Base):
    """Trace chaque webhook reçu et garantit l'idempotence (anti-double traitement).

    `dedup_key` (réf. transaction agrégateur + statut) est unique par tenant : un
    webhook déjà enregistré est rejeté au niveau base, en plus de la garde applicative.
    """

    __tablename__ = "payment_webhook_events"
    __table_args__ = (
        UniqueConstraint("restaurant_id", "dedup_key", name="uq_webhook_event_tenant_dedup"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True, nullable=True)
    transaction_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("payment_transactions.id"), index=True, nullable=True)
    provider: Mapped[str] = mapped_column(String(40), nullable=False)
    provider_tx_id: Mapped[str | None] = mapped_column(String(120), index=True, nullable=True)
    dedup_key: Mapped[str] = mapped_column(String(180), nullable=False)
    status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    signature_valid: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    raw_payload: Mapped[str | None] = mapped_column(Text, nullable=True)
    received_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)


class PaymentRequest(Base):
    """Demande de paiement saisie par un serveur et validée par la caisse.

    Le serveur récupère le mode de paiement choisi par le client (Orange / MTN /
    Espèces) sur une commande finalisée. La demande arrive à la caisse qui la
    valide : pour le mobile, le push USSD part alors chez le client.
    """

    __tablename__ = "payment_requests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True, nullable=False)
    order_id: Mapped[str] = mapped_column(String(36), ForeignKey("customer_orders.id"), index=True, nullable=False)

    # Mode demandé : ORANGE | MTN | CASH
    method: Mapped[str] = mapped_column(String(20), nullable=False)
    payer_msisdn: Mapped[str | None] = mapped_column(String(30), nullable=True)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Statut : PENDING | VALIDATED | REJECTED | CANCELLED
    status: Mapped[str] = mapped_column(String(20), default="PENDING", nullable=False, index=True)

    requested_by_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    requested_by_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    validated_by_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    transaction_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("payment_transactions.id"), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
