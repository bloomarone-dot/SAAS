from datetime import datetime
from typing import Optional

from app.modules.shared.schemas import OrmModel


class AuditLogPublic(OrmModel):
    id: str
    restaurant_id: Optional[str] = None
    user_id: Optional[str] = None
    user_role: Optional[str] = None
    action: str
    entity_type: str
    entity_id: Optional[str] = None
    description: str
    details_json: Optional[str] = None
    created_at: datetime
