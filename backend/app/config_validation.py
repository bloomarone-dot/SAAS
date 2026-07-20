"""Validations de configuration bloquantes en environnement production."""

import os

from app.security import ENVIRONMENT, _secret_is_weak

_PRODUCTION = {"production", "prod"}

# Mots de passe superadmin / demo connus des templates — interdits en prod.
_FORBIDDEN_PASSWORDS = {
    "superadmin123!",
    "changeme123!",
    "admin123!",
    "restaurant_password",
}


def is_production_environment() -> bool:
    return ENVIRONMENT in _PRODUCTION


def validate_production_environment() -> None:
    """Refuse le demarrage si des secrets ou options dev sont encore actifs."""
    if not is_production_environment():
        return

    errors: list[str] = []

    mysql_password = os.getenv("MYSQL_PASSWORD", "restaurant_password")
    if mysql_password == "restaurant_password" or _secret_is_weak(mysql_password):
        errors.append(
            "MYSQL_PASSWORD invalide en production: utilisez un mot de passe aleatoire "
            "d'au moins 32 caracteres."
        )

    mysql_root = os.getenv("MYSQL_ROOT_PASSWORD", "").strip()
    if mysql_root and _secret_is_weak(mysql_root):
        errors.append("MYSQL_ROOT_PASSWORD invalide en production (placeholder ou trop court).")

    if os.getenv("RETURN_DEV_RESET_TOKEN", "true").lower() == "true":
        errors.append("RETURN_DEV_RESET_TOKEN doit etre false en production.")

    if os.getenv("SEED_DEMO_RESTAURANT", "true").lower() == "true":
        errors.append("SEED_DEMO_RESTAURANT doit etre false en production.")

    superadmin_password = os.getenv("SUPERADMIN_PASSWORD", "Superadmin123!")
    if superadmin_password.lower() in _FORBIDDEN_PASSWORDS or _secret_is_weak(superadmin_password):
        errors.append(
            "SUPERADMIN_PASSWORD invalide en production: mot de passe fort et unique requis."
        )

    superadmin_email = os.getenv("SUPERADMIN_EMAIL", "superadmin@restaurant.test").lower().strip()
    superadmin_username = os.getenv("SUPERADMIN_USERNAME", "superadmin").lower().strip()
    if superadmin_email == "superadmin@restaurant.test" or superadmin_username == "superadmin":
        errors.append("SUPERADMIN_EMAIL et SUPERADMIN_USERNAME ne doivent pas utiliser les valeurs par defaut.")

    cors_origins = os.getenv("CORS_ALLOWED_ORIGINS", "")
    if not cors_origins.strip():
        errors.append("CORS_ALLOWED_ORIGINS doit etre defini en production.")
    elif any(host in cors_origins for host in ("localhost", "127.0.0.1")):
        errors.append("CORS_ALLOWED_ORIGINS ne doit pas inclure localhost en production.")

    app_public_url = os.getenv("APP_PUBLIC_URL", "").strip()
    if not app_public_url or app_public_url.startswith("http://localhost"):
        errors.append("APP_PUBLIC_URL doit pointer vers l'URL publique HTTPS du backend.")

    if errors:
        raise RuntimeError(
            "Configuration production invalide:\n- " + "\n- ".join(errors)
        )
