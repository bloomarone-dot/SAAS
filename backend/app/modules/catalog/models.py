from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.modules.shared.models import new_id


class MenuCategory(Base):
    """Categorie de plats appartenant a un restaurant."""

    __tablename__ = "menu_categories"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    items = relationship("MenuItem", back_populates="category", cascade="all, delete-orphan")


class MenuItem(Base):
    """Plat ou produit vendable dans le menu."""

    __tablename__ = "menu_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True, nullable=False)
    category_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("menu_categories.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    price: Mapped[float] = mapped_column(Float, nullable=False)
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    category = relationship("MenuCategory", back_populates="items")

