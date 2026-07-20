"""Helpers d'isolation multi-tenant.

Centralise le chargement scope par restaurant pour eviter de reposer sur le
reflexe (faillible) d'ajouter un filtre `restaurant_id` dans chaque endpoint.
Toute entite metier exposee a un tenant doit etre chargee via `tenant_get_or_404`
plutot que `db.get(Model, id)`, qui ne verifie pas l'appartenance.
"""
from __future__ import annotations

from typing import Any, Sequence, TypeVar

from fastapi import HTTPException
from sqlalchemy.orm import Session

T = TypeVar("T")


def tenant_get_or_404(
    db: Session,
    model: type[T],
    pk: Any,
    restaurant_id: str,
    *,
    detail: str = "Ressource introuvable",
    for_update: bool = False,
    options: Sequence[Any] | None = None,
) -> T:
    """Charge une entite en imposant le scope tenant; 404 si absente ou cross-tenant.

    `for_update=True` ajoute un verrou pessimiste (SELECT ... FOR UPDATE) utile
    pour les sequences lecture-puis-ecriture sensibles a la concurrence.
    `options` permet d'ajouter des loaders SQLAlchemy (ex. selectinload).
    """
    query = db.query(model).filter(
        model.id == pk,
        model.restaurant_id == restaurant_id,
    )
    if options:
        query = query.options(*options)
    if for_update:
        query = query.with_for_update()
    obj = query.one_or_none()
    if obj is None:
        raise HTTPException(status_code=404, detail=detail)
    return obj


def tenant_get_optional(
    db: Session,
    model: type[T],
    pk: Any | None,
    restaurant_id: str,
    *,
    detail: str = "Ressource introuvable",
    for_update: bool = False,
) -> T | None:
    """Comme tenant_get_or_404 mais retourne None si pk est absent."""
    if not pk:
        return None
    return tenant_get_or_404(
        db,
        model,
        pk,
        restaurant_id,
        detail=detail,
        for_update=for_update,
    )


def tenant_find(
    db: Session,
    model: type[T],
    pk: Any | None,
    restaurant_id: str,
) -> T | None:
    """Lookup scope tenant sans lever d'exception (enrichissement / affichage)."""
    if not pk:
        return None
    return (
        db.query(model)
        .filter(model.id == pk, model.restaurant_id == restaurant_id)
        .one_or_none()
    )
