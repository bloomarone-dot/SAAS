# Backend modules

Organisation par domaine metier:

- `auth`: authentification, payloads de connexion et profil courant.
- `restaurants`: modele tenant, provisioning des restaurants et configuration.
- `branches`: modele et endpoints des points de vente d'un restaurant.
- `users`: modeles utilisateurs, permissions explicites par compte, schemas et endpoints du personnel.
- `permissions`: roles, enum des permissions, groupes de permissions, presets par role et endpoints de referentiel.
- `catalog`: categories de menu et plats geres par l'administrateur/proprietaire.
- `stock`: references stock, mouvements, alertes de seuil, inventaire, avaries et donnees comptables.
- `dashboard`: indicateurs reels exposes aux tableaux de bord.
- `shared`: helpers communs et base de schemas.

Chaque module porte ses fichiers proches du domaine: `models.py`, `schemas.py`,
`router.py` quand ils sont utiles. Le fichier `app.modules.models` sert de
registre SQLAlchemy pour importer tous les modeles avant `Base.metadata.create_all`
ou les futures migrations Alembic.

Les anciens imports `app.models`, `app.schemas` et `app.routers.*` sont conserves
comme wrappers de compatibilite. Les nouveaux developpements doivent importer
depuis `app.modules.<domaine>`.
