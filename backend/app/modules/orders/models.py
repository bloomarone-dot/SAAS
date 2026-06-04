from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.modules.shared.models import new_id


class CustomerOrder(Base):
    """Commande passee depuis la vitrine publique d'un restaurant."""

    __tablename__ = "customer_orders"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    restaurant_id: Mapped[str] = mapped_column(String(36), ForeignKey("restaurants.id"), index=True, nullable=False)
    branch_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("branches.id"), index=True, nullable=True)
    table_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("restaurant_tables.id"), index=True, nullable=True)
    server_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), index=True, nullable=True)
    party_size: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    order_number: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    customer_name: Mapped[str] = mapped_column(String(160), nullable=False)
    customer_phone: Mapped[str] = mapped_column(String(40), nullable=False)
    customer_address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(40), default="Nouvelle", nullable=False)
    fulfillment_type: Mapped[str] = mapped_column(String(40), default="Livraison", nullable=False)
    payment_method: Mapped[str] = mapped_column(String(40), default="Paiement à la livraison", nullable=False)
    payment_status: Mapped[str] = mapped_column(String(40), default="En attente", nullable=False)
    transaction_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    discount_amount: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    delivery_fee: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    total_amount: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    items = relationship("CustomerOrderItem", back_populates="order", cascade="all, delete-orphan")


class CustomerOrderItem(Base):
    """Ligne de commande avec snapshot du plat au moment de l'achat."""

    __tablename__ = "customer_order_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    order_id: Mapped[str] = mapped_column(String(36), ForeignKey("customer_orders.id"), index=True, nullable=False)
    menu_item_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("menu_items.id"), nullable=True)
    stock_item_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("stock_items.id"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    sale_channel: Mapped[str] = mapped_column(String(20), default="REPAS", nullable=False, index=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[float] = mapped_column(Float, nullable=False)
    line_total: Mapped[float] = mapped_column(Float, nullable=False)

    order = relationship("CustomerOrder", back_populates="items")
