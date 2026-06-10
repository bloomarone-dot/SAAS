# Migrations Alembic

Alembic est câblé sur `Base.metadata` (via `app.modules.models`) et sur l'URL de
l'application (`DATABASE_URL`). Objectif : remplacer progressivement les fonctions
`ensure_*_columns()` de `app/main.py` (migrations « maison » au démarrage) par des
révisions versionnées et réversibles.

## Générer la baseline (à faire une fois, contre la base réelle)

La base de prod/dev existe déjà (créée par `create_all`). On crée donc une révision
initiale qui décrit le schéma courant, puis on la « stampe » sans la rejouer :

```bash
cd backend
alembic revision --autogenerate -m "baseline schema"
# Vérifier le fichier généré dans migrations/versions/ puis :
alembic stamp head        # marque la base existante comme étant à jour
```

## Cycle de travail ensuite

```bash
# après modification d'un modèle SQLAlchemy
alembic revision --autogenerate -m "ajout colonne X sur table Y"
alembic upgrade head       # applique
alembic downgrade -1       # rollback de la dernière révision
```

## Sortie de la dette `ensure_*`

Une fois la baseline en place et les déploiements basculés sur `alembic upgrade head`
(idéalement dans l'entrypoint Docker, avant `uvicorn`), retirer les appels
`ensure_*_columns()` / `Base.metadata.create_all()` de l'événement `startup` de
`app/main.py`. Migration recommandée colonne par colonne pour valider en douceur.

> Note : `compare_type=True` est activé pour détecter les changements de type.
> Vérifiez toujours le diff autogénéré (Alembic ne détecte pas tout : renommages,
> contraintes nommées, index spécifiques MySQL).
