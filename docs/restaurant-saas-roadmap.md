# Restaurant SaaS Roadmap

## Etat actuel

- `backend` contient maintenant le socle FastAPI pour creer un restaurant, affecter un administrateur proprietaire, connecter cet administrateur, configurer le restaurant, creer le personnel, creer des branches et attribuer des permissions precises au personnel.
- La base cible est MySQL via SQLAlchemy et PyMySQL. La configuration se fait avec `DATABASE_URL` ou les variables `MYSQL_*` de `.env.example`.
- `frontend` est une migration Vite incomplete d'un projet Next.js. Les anciens fichiers `src/app`, server actions, Prisma et `next/*` doivent etre retires ou remplaces avant de brancher l'API.
- Le menu front centralise est dans `frontend/src/config/menu.js`.

## Modele propre cible

1. `Restaurant` represente l'organisation/tenant.
2. `Branch` represente un point de vente physique du restaurant.
3. `User` appartient a un restaurant, et peut etre attache a une branche.
4. `User.role` donne les permissions par defaut et pilote l'acteur principal.
5. `UserPermission` ajoute des droits precis utilisateur par utilisateur.
6. `User.is_owner` distingue l'administrateur proprietaire autorise a configurer les informations sensibles du restaurant et a gerer les permissions.

## Flux prioritaire

1. Un super administrateur ou un endpoint de provisioning cree le restaurant avec son administrateur proprietaire.
2. L'administrateur se connecte via `/api/v1/auth/login`.
3. L'administrateur proprietaire configure son restaurant via `/api/v1/restaurants/me/settings`.
4. L'administrateur cree les branches via `/api/v1/branches`.
5. L'administrateur cree le personnel via `/api/v1/users`, en limitant les roles aux roles operationnels.
6. Le proprietaire peut fournir `permissions` pendant la creation ou appeler `PUT /api/v1/users/{user_id}/permissions`.
7. Le frontend recupere `/api/v1/auth/me`, applique le theme du restaurant et filtre le menu avec `getMenuForUser(user)`.

## Endpoints ajoutes

- `POST /api/v1/restaurants` : cree un restaurant et son admin proprietaire.
- `POST /api/v1/auth/login` : retourne un bearer token.
- `GET /api/v1/auth/me` : retourne l'utilisateur connecte.
- `GET /api/v1/restaurants/me` : retourne le restaurant de l'admin connecte.
- `PATCH /api/v1/restaurants/me/settings` : met a jour nom, logo, couleurs, devise et timezone.
- `GET /api/v1/branches` et `POST /api/v1/branches` : liste et creation de branches.
- `GET /api/v1/users` et `POST /api/v1/users` : liste et creation du personnel.
- `GET /api/v1/users/permissions` : liste les permissions attribuables.
- `PUT /api/v1/users/{user_id}/permissions` : remplace les permissions explicites d'un utilisateur.

## Prochaines etapes techniques

1. Creer la base MySQL: `CREATE DATABASE restaurant_saas CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`.
2. Remplacer `Base.metadata.create_all` par Alembic avant production.
3. Ajouter un vrai `SECRET_KEY` dans `.env` et refuser la valeur par defaut en production.
4. Ajouter un role `SUPERADMIN` protege pour le provisioning au lieu d'exposer `POST /restaurants` publiquement.
5. Migrer le frontend vers React Router et supprimer les dependances `next/*`.
6. Ajouter une couche API front (`src/services/api.js`) qui injecte le bearer token.
7. Ajouter les pages React: login, settings restaurant, branches, users, permissions.
8. Appliquer les couleurs du restaurant avec des variables CSS au chargement de session.
9. Ajouter des tests backend sur l'isolation tenant et les permissions.
