import os


def kitchen_enabled() -> bool:
    """Module cuisine actif (tickets, écran cuisinier). Désactivé par défaut."""
    value = os.getenv("KITCHEN_ENABLED", "false").strip().lower()
    return value in {"1", "true", "yes", "on"}
