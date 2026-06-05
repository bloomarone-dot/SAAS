import base64
import hashlib
import hmac
import json
import os
import secrets
from datetime import datetime, timedelta, timezone


SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-production")
ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "720"))
PASSWORD_RESET_TOKEN_EXPIRE_MINUTES = int(os.getenv("PASSWORD_RESET_TOKEN_EXPIRE_MINUTES", "30"))
MIN_PASSWORD_LENGTH = 10

if ENVIRONMENT in {"production", "prod"} and (
    SECRET_KEY in {"", "change-me-in-production", "change-this-secret-in-production"}
    or len(SECRET_KEY) < 32
):
    raise RuntimeError("SECRET_KEY must be set to a strong value in production")


def hash_password(password: str) -> str:
    """Hash un mot de passe avec PBKDF2 et un sel unique."""
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 210_000)
    return f"pbkdf2_sha256${salt}${digest.hex()}"


def verify_password(password: str, password_hash: str) -> bool:
    """Compare un mot de passe en clair avec le hash stocke."""
    try:
        algorithm, salt, expected = password_hash.split("$", 2)
    except ValueError:
        return False

    if algorithm != "pbkdf2_sha256":
        return False

    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 210_000).hex()
    return hmac.compare_digest(digest, expected)


def validate_password_strength(password: str) -> str:
    """Applique une politique minimale aux mots de passe crees ou reinitialises."""
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"Le mot de passe doit contenir au moins {MIN_PASSWORD_LENGTH} caracteres")
    checks = (
        any(character.islower() for character in password),
        any(character.isupper() for character in password),
        any(character.isdigit() for character in password),
        any(not character.isalnum() for character in password),
    )
    if not all(checks):
        raise ValueError("Le mot de passe doit contenir minuscule, majuscule, chiffre et symbole")
    return password


def detect_image_extension(content: bytes) -> str | None:
    """Verifie les signatures binaires des formats image autorises."""
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if content.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return ".webp"
    return None


def verify_hmac_sha256_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    """Compare une signature HMAC SHA-256 en acceptant les prefixes sha256= courants."""
    if not signature or not secret:
        return False
    normalized = signature.removeprefix("sha256=").strip()
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(normalized, expected)


def _b64encode(payload: bytes) -> str:
    return base64.urlsafe_b64encode(payload).rstrip(b"=").decode()


def _b64decode(payload: str) -> bytes:
    padding = "=" * (-len(payload) % 4)
    return base64.urlsafe_b64decode(payload + padding)


def create_access_token(subject: str) -> str:
    """Cree un JWT HS256 minimal contenant l'id utilisateur et l'expiration."""
    header = {"alg": "HS256", "typ": "JWT"}
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": subject, "exp": int(expires_at.timestamp())}

    signing_input = ".".join(
        [
            _b64encode(json.dumps(header, separators=(",", ":")).encode()),
            _b64encode(json.dumps(payload, separators=(",", ":")).encode()),
        ]
    )
    signature = hmac.new(SECRET_KEY.encode(), signing_input.encode(), hashlib.sha256).digest()
    return f"{signing_input}.{_b64encode(signature)}"


def create_password_reset_token(subject: str) -> str:
    """Cree un token temporaire dedie a la reinitialisation de mot de passe."""
    header = {"alg": "HS256", "typ": "JWT"}
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=PASSWORD_RESET_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": subject, "purpose": "password_reset", "exp": int(expires_at.timestamp())}

    signing_input = ".".join(
        [
            _b64encode(json.dumps(header, separators=(",", ":")).encode()),
            _b64encode(json.dumps(payload, separators=(",", ":")).encode()),
        ]
    )
    signature = hmac.new(SECRET_KEY.encode(), signing_input.encode(), hashlib.sha256).digest()
    return f"{signing_input}.{_b64encode(signature)}"


def decode_access_token(token: str) -> dict | None:
    """Valide la signature et l'expiration du token d'acces."""
    try:
        header_b64, payload_b64, signature_b64 = token.split(".", 2)
        signing_input = f"{header_b64}.{payload_b64}"
        expected = hmac.new(SECRET_KEY.encode(), signing_input.encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(_b64encode(expected), signature_b64):
            return None
        payload = json.loads(_b64decode(payload_b64))
    except Exception:
        return None

    if int(payload.get("exp", 0)) < int(datetime.now(timezone.utc).timestamp()):
        return None

    return payload


def decode_password_reset_token(token: str) -> dict | None:
    """Valide un token de reinitialisation et son usage."""
    payload = decode_access_token(token)
    if not payload or payload.get("purpose") != "password_reset":
        return None
    return payload
