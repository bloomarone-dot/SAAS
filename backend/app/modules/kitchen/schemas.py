from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from .models import KitchenStatus

class KitchenTicketBase(BaseModel):
    order_id: str
    table_number: str
    item_name: str
    quantity: int = Field(default=1, ge=1)
    notes: Optional[str] = None

class KitchenTicketCreate(KitchenTicketBase):
    pass

class KitchenTicketUpdateStatus(BaseModel):
    status: KitchenStatus

class KitchenTicketResponse(KitchenTicketBase):
    id: int
    status: KitchenStatus
    created_at: datetime

    class Config:
        from_attributes = True
