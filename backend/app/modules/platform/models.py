from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.modules.shared.models import new_id, utcnow


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
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, onupdate=utcnow, nullable=False
    )

    restaurant = relationship("Restaurant")


class InstanceRequest(Base):
    """Demande publique de création d'une instance restaurant (depuis la landing SaaS)."""

    __tablename__ = "instance_requests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_name: Mapped[str] = mapped_column(String(191), nullable=False)
    owner_name: Mapped[str] = mapped_column(String(160), nullable=False)
    owner_email: Mapped[str | None] = mapped_column(String(191), nullable=True)
    owner_phone: Mapped[str] = mapped_column(String(40), nullable=False)
    city: Mapped[str | None] = mapped_column(String(120), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    business_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    employees_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    # pending | approved | rejected
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True, nullable=False)
    created_restaurant_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("restaurants.id"), nullable=True)
    reviewed_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)


class PlatformSetting(Base):
    """Parametre global persiste de la plateforme SaaS."""

    __tablename__ = "platform_settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, onupdate=utcnow, nullable=False
    )

