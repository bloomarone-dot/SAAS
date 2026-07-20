"""Politiques de rate limiting centralisées (Phase 4.2 — préparation).

Ce module définit les constantes / politiques de limitation et des helpers
réutilisables. Il n'est volontairement branché sur aucun endpoint métier :
les routeurs continuent d'appeler `enforce_rate_limit` en dur tant que les
étapes suivantes n'auront pas migré.

Structure
---------
- ``RateLimitPolicy`` : scope Redis/mémoire + limite + fenêtre.
- ``CURRENT_LIMITS`` : miroir exact des limites déjà appliquées dans auth.
- ``API_LIMITS`` : catalogue cible pour les prochaines étapes (auth + futur).

Helpers :
- ``apply_rate_limit(request, policy)``
- ``@rate_limit(policy)``
- alias ``@public_menu_rate_limit``, ``@public_order_rate_limit``,
  ``@auth_rate_limit``, etc.
"""
from __future__ import annotations

import inspect
from dataclasses import dataclass
from functools import wraps
from typing import Any, Callable, TypeVar

from fastapi import Request

from app.ratelimit import enforce_rate_limit

F = TypeVar("F", bound=Callable[..., Any])


@dataclass(frozen=True, slots=True)
class RateLimitPolicy:
    """Politique de limitation IP + scope.

    Attributes:
        scope: Identifiant de bucket (ex. ``login``, ``refresh``).
        limit: Nombre max de requêtes autorisées dans la fenêtre.
        window_seconds: Durée de la fenêtre glissante en secondes.
    """

    scope: str
    limit: int
    window_seconds: int

    @property
    def label(self) -> str:
        return f"{self.scope}:{self.limit}/{self.window_seconds}s"


# ---------------------------------------------------------------------------
# Limites ACTUELLEMENT en production (miroir 1:1 — ne pas modifier sans audit)
# Utilisées aujourd'hui via appels inline dans auth/router.py.
# ---------------------------------------------------------------------------
class CURRENT_LIMITS:
    """Valeurs déjà appliquées — toute migration doit rester strictement égale."""

    LOGIN = RateLimitPolicy(scope="login", limit=10, window_seconds=300)
    FORGOT_PASSWORD = RateLimitPolicy(scope="forgot", limit=5, window_seconds=900)
    RESET_PASSWORD = RateLimitPolicy(scope="reset", limit=10, window_seconds=900)
    CHANGE_PASSWORD = RateLimitPolicy(scope="change-password", limit=10, window_seconds=900)
    REFRESH = RateLimitPolicy(scope="refresh", limit=30, window_seconds=300)
    LOGOUT = RateLimitPolicy(scope="logout", limit=30, window_seconds=300)


# ---------------------------------------------------------------------------
# Catalogue cible (prochaines étapes) — pas encore branché.
# Les scopes AUTH réutilisent les mêmes valeurs que CURRENT_LIMITS.
# Les scopes métier sont des propositions documentées, non actives.
# ---------------------------------------------------------------------------
class API_LIMITS:
    """Catalogue central pour `@rate_limit(API_LIMITS.X)` (non branché)."""

    # --- Auth (miroir CURRENT_LIMITS) ---
    LOGIN = CURRENT_LIMITS.LOGIN
    FORGOT_PASSWORD = CURRENT_LIMITS.FORGOT_PASSWORD
    RESET_PASSWORD = CURRENT_LIMITS.RESET_PASSWORD
    CHANGE_PASSWORD = CURRENT_LIMITS.CHANGE_PASSWORD
    REFRESH = CURRENT_LIMITS.REFRESH
    LOGOUT = CURRENT_LIMITS.LOGOUT
    AUTH = RateLimitPolicy(scope="auth", limit=60, window_seconds=60)

    # --- Public / commande ---
    PUBLIC_MENU = RateLimitPolicy(scope="public-menu", limit=120, window_seconds=60)
    PUBLIC_ORDER = RateLimitPolicy(scope="public-order", limit=30, window_seconds=60)

    # --- Paiements ---
    PAYMENT = RateLimitPolicy(scope="payment", limit=20, window_seconds=60)
    PAYMENT_WEBHOOK = RateLimitPolicy(scope="payment-webhook", limit=120, window_seconds=60)

    # --- Lecture métier / dashboards ---
    DASHBOARD = RateLimitPolicy(scope="dashboard", limit=60, window_seconds=60)

    # --- Exports lourds ---
    EXPORT = RateLimitPolicy(scope="export", limit=10, window_seconds=300)

    # --- Admin tenant / plateforme ---
    ADMIN = RateLimitPolicy(scope="admin", limit=120, window_seconds=60)
    SUPERADMIN = RateLimitPolicy(scope="superadmin", limit=60, window_seconds=60)


def apply_rate_limit(request: Request, policy: RateLimitPolicy) -> None:
    """Applique une politique via le backend existant (`enforce_rate_limit`)."""
    enforce_rate_limit(
        request,
        scope=policy.scope,
        limit=policy.limit,
        window_seconds=policy.window_seconds,
    )


def _extract_request(args: tuple[Any, ...], kwargs: dict[str, Any]) -> Request:
    request = kwargs.get("request")
    if isinstance(request, Request):
        return request
    for arg in args:
        if isinstance(arg, Request):
            return arg
    raise RuntimeError(
        "rate_limit: paramètre FastAPI `request: Request` requis sur l'endpoint décoré."
    )


def rate_limit(policy: RateLimitPolicy) -> Callable[[F], F]:
    """Décorateur réutilisable : `@rate_limit(API_LIMITS.LOGIN)`.

    Préparé pour les étapes suivantes. Ne pas appliquer tant que la migration
    des appels inline n'est pas planifiée (comportement inchangé aujourd'hui).
    """

    def decorator(endpoint: F) -> F:
        if inspect.iscoroutinefunction(endpoint):

            @wraps(endpoint)
            async def async_wrapper(*args: Any, **kwargs: Any):
                apply_rate_limit(_extract_request(args, kwargs), policy)
                return await endpoint(*args, **kwargs)

            return async_wrapper  # type: ignore[return-value]

        @wraps(endpoint)
        def sync_wrapper(*args: Any, **kwargs: Any):
            apply_rate_limit(_extract_request(args, kwargs), policy)
            return endpoint(*args, **kwargs)

        return sync_wrapper  # type: ignore[return-value]

    return decorator


# Alias pratiques (non branchés) — évite de dupliquer les chaînes de config.
login_rate_limit = rate_limit(API_LIMITS.LOGIN)
refresh_rate_limit = rate_limit(API_LIMITS.REFRESH)
forgot_password_rate_limit = rate_limit(API_LIMITS.FORGOT_PASSWORD)
reset_password_rate_limit = rate_limit(API_LIMITS.RESET_PASSWORD)
change_password_rate_limit = rate_limit(API_LIMITS.CHANGE_PASSWORD)
logout_rate_limit = rate_limit(API_LIMITS.LOGOUT)
public_menu_rate_limit = rate_limit(API_LIMITS.PUBLIC_MENU)
public_order_rate_limit = rate_limit(API_LIMITS.PUBLIC_ORDER)
payment_rate_limit = rate_limit(API_LIMITS.PAYMENT)
dashboard_rate_limit = rate_limit(API_LIMITS.DASHBOARD)
export_rate_limit = rate_limit(API_LIMITS.EXPORT)
admin_rate_limit = rate_limit(API_LIMITS.ADMIN)
superadmin_rate_limit = rate_limit(API_LIMITS.SUPERADMIN)
auth_rate_limit = rate_limit(API_LIMITS.AUTH)
