import uuid

from app.modules.permissions.models import Permission, ROLE_DEFAULT_PERMISSIONS, Role


def new_id() -> str:
    """Genere un identifiant UUID texte compatible MySQL et SQLite."""
    return str(uuid.uuid4())


__all__ = ["Permission", "ROLE_DEFAULT_PERMISSIONS", "Role", "new_id"]
