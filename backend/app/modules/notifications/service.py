import logging
import threading

from sqlalchemy.orm import Session

from app.email import is_email_configured, send_notification_email
from app.modules.notifications.models import Notification
from app.modules.permissions.models import Role
from app.modules.users.models import User

logger = logging.getLogger(__name__)


def _recipient_emails(
    db: Session,
    restaurant_id: str | None,
    user_id: str | None,
    role: str | None,
) -> list[str]:
    """Resout les emails des destinataires d'une notification (utilisateur ou role)."""
    query = db.query(User.email).filter(User.email.isnot(None), User.is_active.is_(True))
    if user_id:
        query = query.filter(User.id == user_id)
    elif role:
        try:
            role_enum = Role(role)
        except ValueError:
            return []
        query = query.filter(User.restaurant_id == restaurant_id, User.role == role_enum)
    else:
        return []
    return [email for (email,) in query.all() if email]


def _send_emails_async(emails: list[str], title: str, message: str) -> None:
    """Envoi non bloquant (les emails ne doivent jamais ralentir l'action metier)."""
    def _run() -> None:
        for address in emails:
            send_notification_email(address, title, message)

    threading.Thread(target=_run, daemon=True).start()


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
    email: bool = False,
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

    # Pour les evenements critiques : double canal email (si SMTP configure).
    if email and is_email_configured():
        try:
            recipients = _recipient_emails(db, restaurant_id, user_id, role)
            if recipients:
                _send_emails_async(recipients, title, message)
        except Exception:
            logger.exception("Resolution des destinataires email impossible pour la notification")

    return notification
