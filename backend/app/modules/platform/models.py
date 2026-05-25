from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.modules.shared.models import new_id


class RestaurantSubscription(Base):
    """Souscription commerciale rattachee a un tenant restaurant."""

    __tablename__ = "restaurant_subscriptions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("restaurants.id"),
        unique=True,
        index=True,
        nullable=False,
    )
    plan: Mapped[str] = mapped_column(String(80), default="Non configure", nullable=False)
    amount: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="XAF", nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="A configurer", nullable=False)
    renewal_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    restaurant = relationship("Restaurant")


class PlatformSetting(Base):
    """Parametre global persiste de la plateforme SaaS."""

    __tablename__ = "platform_settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

