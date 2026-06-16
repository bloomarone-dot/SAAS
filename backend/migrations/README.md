# Migrations Alembic

Alembic est câblé sur `Base.metadata` (via `app.modules.models`, qui agrège **tous**
les modèles) et sur l'URL de l'application (`DATABASE_URL`). Objectif : remplacer
progressivement les fonctions `ensure_*_columns()` de `app/main.py` (migrations
« maison » au démarrage) par des révisions versionnées et réversibles.

`alembic.ini` + `migrations/` sont désormais embarqués dans l'image Docker, donc
toutes les commandes se lancent **dans le conteneur backend**.

> ⚠️ Après modification du `Dockerfile`/`migrations`, reconstruire l'image :
> `docker compose up -d --build backend` (ou `-f docker-compose.prod.yml`).

## 1. Générer la baseline (une seule fois, contre la base réelle)

La base existe déjà (créée par `create_all`). On crée une révision initiale qui
décrit le schéma courant, puis on la « stampe » sans la rejouer :

```bash
docker compose exec backend alembic revision --autogenerate -m "baseline schema"
# Relire le fichier généré dans migrations/versions/ (vérifier qu'il n'y a pas de
# DROP intempestif), puis marquer la base existante comme à jour SANS rejouer :
docker compose exec backend alembic stamp head
```

> Si le diff autogénéré est vide, c'est normal : `create_all` + `ensure_*` ont déjà
> réalisé le schéma. La baseline sert de point de départ aux révisions suivantes.

## 2. Cycle de travail ensuite

```bash
# après modification d'un modèle SQLAlchemy
docker compose exec backend alembic revision --autogenerate -m "ajout colonne X sur Y"
docker compose exec backend alembic upgrade head     # applique
docker compose exec backend alembic downgrade -1     # rollback de la dernière révision
docker compose exec backend alembic current          # révision appliquée
docker compose exec backend alembic history          # historique
```

À partir de maintenant, **ne plus ajouter de colonnes via `ensure_*`** : passer par
une révision autogénérée.

## 3. Sortie de la dette `ensure_*` (cible)

Quand la baseline est en place et les déploiements basculés sur `alembic upgrade head`
dans l'entrypoint Docker (avant `uvicorn`) :

1. Vérifier que chaque `ensure_*_columns()` est couvert par une révision.
2. Retirer les appels `ensure_*_columns()` / `Base.metadata.create_all()` du `startup`
   de `app/main.py`.
3. Pour une base neuve, `alembic upgrade head` recrée tout le schéma.

Tant que la transition n'est pas finie, `create_all`/`ensure_*` restent un filet de
sécurité idempotent et **coexistent** sans danger avec Alembic.

> Notes : `compare_type=True` et `compare_server_default=True` sont activés. Alembic
> ne détecte pas tout (renommages, contraintes nommées, index MySQL spécifiques) :
> **toujours relire** le diff autogénéré avant `upgrade`.
