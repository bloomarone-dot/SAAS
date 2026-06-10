"""Helpers d'isolation multi-tenant.

Centralise le chargement scope par restaurant pour eviter de reposer sur le
reflexe (faillible) d'ajouter un filtre `restaurant_id` dans chaque endpoint.
Toute entite metier exposee a un tenant doit etre chargee via `tenant_get_or_404`
plutot que `db.get(Model, id)`, qui ne verifie pas l'appartenance.
"""
from __future__ import annotations

from typing import TypeVar

from fastapi import HTTPException
from sqlalchemy.orm import Session

T = TypeVar("T")


def tenant_get_or_404(
    db: Session,
    model: type[T],
    pk,
    restaurant_id: str,
    *,
    detail: str = "Ressource introuvable",
    for_update: bool = False,
) -> T:
    """Charge une entite en imposant le scope tenant; 404 si absente ou cross-tenant.

    `for_update=True` ajoute un verrou pessimiste (SELECT ... FOR UPDATE) utile
    pour les sequences lecture-puis-ecriture sensibles a la concurrence.
    """
    query = db.query(model).filter(
        model.id == pk,
        model.restaurant_id == restaurant_id,
    )
    if for_update:
        query = query.with_for_update()
    obj = query.one_or_none()
    if obj is None:
        raise HTTPException(status_code=404, detail=detail)
    return obj
