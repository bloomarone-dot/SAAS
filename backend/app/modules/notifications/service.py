from sqlalchemy.orm import Session

from app.modules.notifications.models import Notification


def notify(
    db: Session,
    *,
    title: str,
    message: str,
    restaurant_id: str | None = None,
    user_id: str | None = None,
    role: str | None = None,
    category: str = "system",
    link: str | None = None,
) -> Notification:
    notification = Notification(
        restaurant_id=restaurant_id,
        user_id=user_id,
        role=role,
        title=title,
        message=message,
        category=category,
        link=link,
    )
    db.add(notification)
    return notification
