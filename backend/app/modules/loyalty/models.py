"""Carte de fidélité : 9 plats commandés → le 10e offert."""

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.modules.shared.models import new_id, utcnow

# Nombre de plats payants avant un plat offert.
LOYALTY_STAMPS_FOR_REWARD = 9
LOYALTY_CYCLE = LOYALTY_STAMPS_FOR_REWARD + 1  # 10


class LoyaltyCard(Base):
    __tablename__ = "loyalty_cards"
    __table_args__ = (
        UniqueConstraint("restaurant_id", "phone", name="uq_loyalty_restaurant_phone"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    phone: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    customer_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    # Tampons accumulés dans le cycle courant (0..9).
    stamps: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_dishes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    free_meals_claimed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    item_stamps_json: Mapped[str | None] = mapped_column(String(4000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)
