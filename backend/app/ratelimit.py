"""Limiteur de debit avec backend pluggable.

Par defaut: fenetre glissante en memoire processus (mono-instance).
Si la variable d'environnement REDIS_URL est definie ET que le paquet `redis`
est installe, le compteur bascule automatiquement sur Redis pour fonctionner de
maniere coherente entre plusieurs workers / instances derriere un load balancer.

Les deux backends exposent la meme methode `hit(key, limit, window_seconds)`.
"""
from __future__ import annotations

import logging
import os
import threading
import time

from fastapi import HTTPException, Request, status

logger = logging.getLogger(__name__)


class InMemoryLimiter:
    """Fenetre glissante stockee en memoire (suffisant en mono-instance)."""

    def __init__(self) -> None:
        self._hits: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def hit(self, key: str, *, limit: int, window_seconds: int) -> bool:
        now = time.monotonic()
        floor = now - window_seconds
        with self._lock:
            timestamps = [t for t in self._hits.get(key, []) if t > floor]
            if len(timestamps) >= limit:
                self._hits[key] = timestamps
                return False
            timestamps.append(now)
            self._hits[key] = timestamps
            return True

    def prune(self, max_age_seconds: int = 3600) -> None:
        floor = time.monotonic() - max_age_seconds
        with self._lock:
            for key in list(self._hits):
                kept = [t for t in self._hits[key] if t > floor]
                if kept:
                    self._hits[key] = kept
                else:
                    self._hits.pop(key, None)


# Compat retro: ancien nom de classe utilise par les tests existants.
SlidingWindowLimiter = InMemoryLimiter


class RedisLimiter:
    """Fenetre glissante partagee via Redis (sorted set par cle).

    Algorithme atomique cote serveur Redis: on purge les horodatages hors fenetre,
    on compte, et on ajoute le nouvel acces si le quota n'est pas atteint.
    En cas d'indisponibilite Redis, on autorise la requete (fail-open) pour ne
    jamais bloquer l'authentification a cause d'une panne d'infrastructure.
    """

    _LUA = """
    local key = KEYS[1]
    local now = tonumber(ARGV[1])
    local window = tonumber(ARGV[2])
    local limit = tonumber(ARGV[3])
    redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
    local count = redis.call('ZCARD', key)
    if count >= limit then
        return 0
    end
    redis.call('ZADD', key, now, now .. '-' .. math.random())
    redis.call('EXPIRE', key, window)
    return 1
    """

    def __init__(self, client) -> None:
        self._client = client
        self._script = client.register_script(self._LUA)

    def hit(self, key: str, *, limit: int, window_seconds: int) -> bool:
        try:
            allowed = self._script(keys=[f"ratelimit:{key}"], args=[time.time(), window_seconds, limit])
            return bool(allowed)
        except Exception:  # noqa: BLE001 - fail-open sur panne Redis
            logger.warning("Backend Redis du rate limiter indisponible; requete autorisee.")
            return True


def _build_limiter():
    redis_url = os.getenv("REDIS_URL", "").strip()
    if not redis_url:
        return InMemoryLimiter()
    try:
        import redis  # type: ignore

        client = redis.Redis.from_url(redis_url, decode_responses=True)
        client.ping()
        logger.info("Rate limiter: backend Redis actif.")
        return RedisLimiter(client)
    except Exception:  # noqa: BLE001 - degrade proprement vers la memoire
        logger.warning("REDIS_URL defini mais Redis injoignable; bascule en memoire.")
        return InMemoryLimiter()


_limiter = _build_limiter()


def client_ip(request: Request) -> str:
    """Resout l'IP cliente en tenant compte d'un proxy de confiance (X-Forwarded-For)."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def enforce_rate_limit(
    request: Request,
    *,
    scope: str,
    limit: int,
    window_seconds: int,
) -> None:
    """Bloque la requete (HTTP 429) si le quota IP+scope est depasse."""
    key = f"{scope}:{client_ip(request)}"
    if not _limiter.hit(key, limit=limit, window_seconds=window_seconds):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Trop de tentatives. Réessayez dans quelques minutes.",
            headers={"Retry-After": str(window_seconds)},
        )
