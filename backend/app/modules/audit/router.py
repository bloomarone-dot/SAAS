from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import assert_permission, require_tenant_user
from app.modules.audit.models import AuditLog
from app.modules.audit.schemas import AuditLogPublic
from app.modules.permissions.models import Permission
from app.modules.users.models import User

router = APIRouter(prefix="/audit-logs", tags=["audit"])


@router.get("", response_model=list[AuditLogPublic])
def list_audit_logs(
    action: str | None = Query(default=None),
    entity_type: str | None = Query(default=None),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=300),
    current_user: User = Depends(require_tenant_user),
    db: Session = Depends(get_db),
):
    assert_permission(current_user, Permission.RESTAURANT_SETTINGS_READ)
    query = db.query(AuditLog).filter(AuditLog.restaurant_id == current_user.restaurant_id)
    if action:
        query = query.filter(AuditLog.action == action)
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    if start_date:
        query = query.filter(AuditLog.created_at >= start_date)
    if end_date:
        query = query.filter(AuditLog.created_at <= end_date)
    return query.order_by(AuditLog.created_at.desc()).limit(limit).all()
