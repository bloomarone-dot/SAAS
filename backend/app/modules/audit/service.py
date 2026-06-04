import json
from typing import Any

from sqlalchemy.orm import Session

from app.modules.audit.models import AuditLog
from app.modules.users.models import User


def log_action(
    db: Session,
    user: User | None,
    action: str,
    entity_type: str,
    entity_id: str | int | None,
    description: str,
    details: dict[str, Any] | None = None,
) -> None:
    """Ajoute une trace d'audit sans interrompre l'action metier."""
    try:
        db.add(
            AuditLog(
                restaurant_id=user.restaurant_id if user else None,
                user_id=user.id if user else None,
                user_role=user.role.value if user else None,
                action=action,
                entity_type=entity_type,
                entity_id=str(entity_id) if entity_id is not None else None,
                description=description[:255],
                details_json=json.dumps(details, ensure_ascii=False, default=str) if details else None,
            )
        )
    except Exception:
        # L'audit ne doit jamais casser l'operation principale.
        return
