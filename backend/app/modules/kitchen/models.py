from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.sql import func
import enum
from app.database import Base

class KitchenStatus(str, enum.Enum):
    EN_ATTENTE = "En attente"
    EN_PREPARATION = "En préparation"
    PRETE = "Prête"
    SERVIE = "Servie"

class KitchenTicketModel(Base):
    __tablename__ = "kitchen_tickets"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(String(36), ForeignKey("customer_orders.id"), nullable=False) # Lié à la commande globale
    table_number = Column(String(40), nullable=False) # Pour que le cuisinier sache où envoyer le plat
    item_name = Column(String(160), nullable=False)    # Nom du plat (ex: "Poulet DG")
    quantity = Column(Integer, default=1)
    notes = Column(String(255), nullable=True)         # ex: "Sans piment", "Bien cuit"
    status = Column(
        Enum(KitchenStatus, values_callable=lambda enum_cls: [item.value for item in enum_cls]),
        default=KitchenStatus.EN_ATTENTE,
        nullable=False,
    )
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
