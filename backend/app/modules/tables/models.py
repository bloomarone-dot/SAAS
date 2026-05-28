import enum

from sqlalchemy import Column, Enum, ForeignKey, Integer, String

from app.database import Base

class TableStatus(str, enum.Enum):
    LIBRE = "Libre"
    OCCUPEE = "Occupée"
    RESERVEE = "Réservée"

class TableModel(Base):
    __tablename__ = "restaurant_tables"

    id = Column(Integer, primary_key=True, index=True)
    restaurant_id = Column(String(36), ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False)
    number = Column(String(40), nullable=False)
    capacity = Column(Integer, default=2)
    status = Column(
        Enum(TableStatus, values_callable=lambda enum_cls: [item.value for item in enum_cls]),
        default=TableStatus.LIBRE,
        nullable=False,
    )

    @property
    def name(self) -> str:
        return self.number
