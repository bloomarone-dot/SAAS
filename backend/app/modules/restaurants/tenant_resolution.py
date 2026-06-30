import os
import re
import unicodedata
from uuid import uuid4


BASE_DOMAIN = os.getenv("TENANT_BASE_DOMAIN", "bloomarone.com").strip().lower()
PLATFORM_HOSTS = {
    host.strip().lower()
    for host in os.getenv(
        "TENANT_PLATFORM_HOSTS",
        f"restaurant.{BASE_DOMAIN},www.restaurant.{BASE_DOMAIN},platform.{BASE_DOMAIN},www.platform.{BASE_DOMAIN}",
    ).split(",")
    if host.strip()
}
RESERVED_SUBDOMAINS = {"restaurant", "platform", "www", "api", "admin", "app", "assets", "static"}


def generate_slug(name: str) -> str:
    """Generate a URL-friendly slug from a restaurant name."""
    slug = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    slug = slug.lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    slug = re.sub(r"-{2,}", "-", slug)
    slug = slug.strip("-")
    return slug or str(uuid4().hex[:8])


def normalize_subdomain(value: str) -> str:
    """Normalise une valeur utilisable comme sous-domaine public."""
    return generate_slug(value).replace("-", "")[:120] or uuid4().hex[:8]


def clean_host(host: str | None) -> str:
    """Retourne un host sans port, normalisé en minuscule."""
    return (host or "").split(":")[0].strip().lower()


def extract_subdomain(host: str) -> str | None:
    if not host.endswith(f".{BASE_DOMAIN}"):
        return None
    subdomain = host[: -(len(BASE_DOMAIN) + 1)].strip(".")
    if not subdomain or "." in subdomain:
        return None
    return subdomain
