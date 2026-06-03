from datetime import datetime
from typing import Optional

from app.modules.shared.schemas import OrmModel


class NotificationPublic(OrmModel):
    id: str
    restaurant_id: Optional[str] = None
    user_id: Optional[str] = None
    role: Optional[str] = None
    title: str
    message: str
    category: str
    link: Optional[str] = None
    is_read: bool
    created_at: datetime
