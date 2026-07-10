from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.modules.shared.models import new_id, utcnow


class Branch(Base):
    """Point de vente physique appartenant a un restaurant."""

    __tablename__ = "branches"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True)
    name: Mapped[str] = mapped_column(String(191), nullable=False)
    city: Mapped[str] = mapped_column(String(100), nullable=False)
    address: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    manager_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), index=True, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, onupdate=utcnow, nullable=False
    )

    restaurant = relationship("Restaurant", back_populates="branches")
    manager = relationship("User", foreign_keys=[manager_id])
    users = relationship("User", back_populates="branch", foreign_keys="User.branch_id")


class DeliveryArea(Base):
    """Quartier de livraison avec frais parametrables par branche."""

    __tablename__ = "delivery_areas"
    __table_args__ = (UniqueConstraint("restaurant_id", "branch_id", "name", name="uq_delivery_area_branch_name"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True, nullable=False)
    branch_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("branches.id"), index=True, nullable=True)
    name: Mapped[str] = mapped_column(String(191), nullable=False, index=True)
    delivery_fee: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    average_delivery_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    branch = relationship("Branch")
