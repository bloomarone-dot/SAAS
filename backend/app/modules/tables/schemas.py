from pydantic import BaseModel, Field
from typing import Optional
from .models import TableStatus

class TableBase(BaseModel):
    number: str = Field(..., example="T1")
    capacity: int = Field(default=2, ge=1, example=4)

class TableCreate(TableBase):
    pass

class TableUpdate(BaseModel):
    number: Optional[str] = None
    capacity: Optional[int] = None
    status: Optional[TableStatus] = None

class TableResponse(TableBase):
    id: int
    restaurant_id: int
    status: TableStatus

    class Config:
        from_attributes = True