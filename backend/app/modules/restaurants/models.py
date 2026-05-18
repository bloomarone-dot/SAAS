from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.modules.shared.models import new_id


class Restaurant(Base):
    """Organisation SaaS principale, aussi appelee tenant."""

    __tablename__ = "restaurants"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(191), nullable=False)
    slug: Mapped[str] = mapped_column(String(191), unique=True, index=True, nullable=False)
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    primary_color: Mapped[str] = mapped_column(String(20), default="#E4572E", nullable=False)
    secondary_color: Mapped[str] = mapped_column(String(20), default="#1F2937", nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="XAF", nullable=False)
    timezone: Mapped[str] = mapped_column(String(50), default="Africa/Douala", nullable=False)
    owner_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("users.id", use_alter=True, name="fk_restaurants_owner_id_users"),
        nullable=True,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    branches = relationship("Branch", back_populates="restaurant", cascade="all, delete-orphan")
    users = relationship("User", back_populates="restaurant", foreign_keys="User.restaurant_id")
    owner = relationship("User", foreign_keys=[owner_id], post_update=True)

