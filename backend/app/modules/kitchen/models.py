from sqlalchemy import Column, Integer, String, ForeignKey, Enum, DateTime
from sqlalchemy.sql import func
import enum
from app.database import Base

class KitchenStatus(str, enum.Enum):
    PENDING = "PENDING"      
    COOKING = "COOKING"     
    READY = "READY"          
    SERVED = "SERVED"      

class KitchenTicketModel(Base):
    __tablename__ = "kitchen_tickets"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, nullable=False) # Lié à la commande globale
    table_number = Column(String, nullable=False) # Pour que le cuisinier sache où envoyer le plat
    item_name = Column(String, nullable=False)    # Nom du plat (ex: "Poulet DG")
    quantity = Column(Integer, default=1)
    notes = Column(String, nullable=True)         # ex: "Sans piment", "Bien cuit"
    status = Column(Enum(KitchenStatus), default=KitchenStatus.PENDING, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())