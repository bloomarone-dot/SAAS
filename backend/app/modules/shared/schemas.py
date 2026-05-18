from pydantic import BaseModel


class OrmModel(BaseModel):
    """Base Pydantic capable de serialiser directement les objets SQLAlchemy."""

    class Config:
        from_attributes = True

