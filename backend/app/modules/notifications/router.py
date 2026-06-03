from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app.modules.notifications.models import Notification
from app.modules.notifications.schemas import NotificationPublic
from app.modules.permissions.models import Role
from app.modules.users.models import User

router = APIRouter(prefix="/notifications", tags=["notifications"])


def visible_notifications_query(db: Session, current_user: User):
    query = db.query(Notification)
    if current_user.role == Role.SUPERADMIN:
        return query.filter(
            or_(
                Notification.user_id == current_user.id,
                Notification.role == current_user.role.value,
                Notification.restaurant_id.is_(None),
            )
        )
    return query.filter(
        Notification.restaurant_id == current_user.restaurant_id,
        or_(
            Notification.user_id == current_user.id,
            Notification.role == current_user.role.value,
            Notification.user_id.is_(None),
        ),
    )


@router.get("", response_model=list[NotificationPublic])
def list_notifications(
    unread_only: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = visible_notifications_query(db, current_user)
    if unread_only:
        query = query.filter(Notification.is_read.is_(False))
    return query.order_by(Notification.created_at.desc()).limit(limit).all()


@router.patch("/{notification_id}/read", response_model=NotificationPublic)
def mark_notification_read(
    notification_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    notification = visible_notifications_query(db, current_user).filter(Notification.id == notification_id).one_or_none()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification introuvable")
    notification.is_read = True
    db.commit()
    db.refresh(notification)
    return notification


@router.patch("/read-all", response_model=list[NotificationPublic])
def mark_all_notifications_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    notifications = visible_notifications_query(db, current_user).filter(Notification.is_read.is_(False)).all()
    for notification in notifications:
        notification.is_read = True
    db.commit()
    return notifications
