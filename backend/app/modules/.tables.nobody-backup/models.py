from sqlalchemy import Column, Integer, String, ForeignKey, Enum
from sqlalchemy.orm import relationship
import enum
from app.database import Base

class TableStatus(str, enum.Enum):
    FREE = "FREE"
    OCCUPIED = "OCCUPIED"
    RESERVED = "RESERVED"

class TableModel(Base):
    __tablename__ = "restaurant_tables"

    id = Column(Integer, primary_key=True, index=True)
    restaurant_id = Column(Integer, ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False)
    number = Column(String, nullable=False)
    capacity = Column(Integer, default=2)
    status = Column(Enum(TableStatus), default=TableStatus.FREE, nullable=False)
