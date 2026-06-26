import uuid
from datetime import datetime, timezone

from app.modules.permissions.models import Permission, ROLE_DEFAULT_PERMISSIONS, Role


def new_id() -> str:
    """Genere un identifiant UUID texte compatible MySQL et SQLite."""
    return str(uuid.uuid4())


def utcnow() -> datetime:
    """Horodatage UTC **naïf** : remplaçant non déprécié de l'ancien helper standard.

    On reste naïf (sans tzinfo) pour rester compatible avec les colonnes DateTime
    naïves et toutes les comparaisons de dates du code.
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)


__all__ = ["Permission", "ROLE_DEFAULT_PERMISSIONS", "Role", "new_id", "utcnow"]
