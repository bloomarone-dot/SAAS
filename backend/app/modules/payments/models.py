from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.modules.shared.models import new_id


class PaymentTransaction(Base):
    """Trace chaque tentative de paiement mobile (Orange Money, MTN, etc.)."""

    __tablename__ = "payment_transactions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True, nullable=False)
    order_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("customer_orders.id"), index=True, nullable=True)

    # Identification externe
    provider: Mapped[str] = mapped_column(String(40), default="ORANGE_CM", nullable=False)
    provider_tx_id: Mapped[str | None] = mapped_column(String(120), index=True, nullable=True)
    pay_token: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notif_token: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Montant
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="XAF", nullable=False)

    # Numéro payeur
    payer_msisdn: Mapped[str | None] = mapped_column(String(30), nullable=True)

    # Statut : PENDING | SUCCESS | FAILED | CANCELLED | EXPIRED
    status: Mapped[str] = mapped_column(String(30), default="PENDING", nullable=False, index=True)
    failure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Réponse brute du provider (JSON tronqué)
    raw_response: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
