from pydantic import BaseModel, Field
from typing import Optional
from .models import TableStatus

class TableBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=40, example="T1")
    room: str = Field(default="Rez-de-chaussée", min_length=1, max_length=80)
    capacity: int = Field(default=2, ge=1, example=4)

class TableCreate(TableBase):
    pass

class TableUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=40)
    room: Optional[str] = Field(default=None, min_length=1, max_length=80)
    capacity: Optional[int] = Field(default=None, ge=1)
    status: Optional[TableStatus] = None

class TableResponse(TableBase):
    id: int
    restaurant_id: str
    number: str
    room: str
    status: TableStatus
    occupied_seats: int = 0
    free_seats: int = 0

    class Config:
        from_attributes = True


class TableOrderResponse(BaseModel):
    id: str
    order_number: str
    table_id: int
    table_name: str
    server_id: str
    server_name: str
    party_size: int
    status: str
    total_amount: float
    created_at: str


class TableOrderCreateIn(BaseModel):
    party_size: int = Field(default=1, ge=1, le=100)


class TableOrderCreateResponse(BaseModel):
    order: TableOrderResponse
    active_orders: list[TableOrderResponse]
    occupied_seats: int
    free_seats: int
