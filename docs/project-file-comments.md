# Commentaires des fichiers du projet

Ce document commente le role de chaque fichier present dans le projet. Les fichiers generes, JSON, SVG et binaires ne sont pas modifies directement pour eviter de casser leur format ou leur regeneration.

## Racine

- `.env.example` : Exemple de variables d'environnement pour connecter FastAPI a MySQL et configurer les tokens.
- `.gitignore` : Liste les fichiers locaux a ignorer: venv, caches Python, bases SQLite temporaires, `node_modules`, build frontend et `.env`.
- `README.md` : Resume l'origine du projet et son architecture generale.

## Backend

- `backend/requirements.txt` : Dependances Python du backend FastAPI, SQLAlchemy et connecteur MySQL `PyMySQL`.
- `backend/app/main.py` : Point d'entree FastAPI; configure CORS, cree les tables en developpement et enregistre les routeurs API.
- `backend/app/database.py` : Configure la connexion SQLAlchemy, la session par requete et la base declarative des modeles.
- `backend/app/models.py` : Definit les entites metier SQLAlchemy: restaurants, branches, utilisateurs, roles et permissions.
- `backend/app/schemas.py` : Definit les schemas Pydantic d'entree/sortie utilises par les endpoints.
- `backend/app/security.py` : Gere le hash de mot de passe et les tokens d'acces JWT HS256.
- `backend/app/dependencies.py` : Contient les dependances FastAPI d'authentification, tenant et verification de permissions.
- `backend/app/routers/__init__.py` : Rend le dossier `routers` importable comme package Python.
- `backend/app/routers/auth.py` : Endpoints de connexion et de recuperation du profil courant.
- `backend/app/routers/restaurants.py` : Endpoints de creation/provisioning restaurant et configuration du restaurant courant.
- `backend/app/routers/branches.py` : Endpoints de lecture et creation des branches du restaurant courant.
- `backend/app/routers/users.py` : Endpoints de lecture, creation du personnel et gestion des permissions utilisateur.

## Documentation

- `docs/restaurant-saas-roadmap.md` : Roadmap technique du SaaS restaurant, flux prioritaires, endpoints et prochaines etapes.
- `docs/project-file-comments.md` : Inventaire commente de tous les fichiers du projet.

## Frontend - Configuration et entree Vite

- `frontend/package.json` : Declare les scripts Vite et les dependances React du frontend.
- `frontend/vite.config.js` : Configure Vite, React et l'alias `@` vers `src`.
- `frontend/index.html` : Page HTML racine dans laquelle React monte l'application.
- `frontend/MIGRATION_NOTES.md` : Notes sur l'etat de migration depuis Next.js vers React/Vite.
- `frontend/REACT_MIGRATION.md` : Documentation des remplacements effectues et des limites restantes de migration.
- `frontend/src/main.jsx` : Point d'entree React qui monte `<App />` dans le DOM.
- `frontend/src/App.jsx` : Composant racine temporaire indiquant que le frontend Vite est pret.
- `frontend/src/config/menu.js` : Definition centralisee des roles, permissions et entrees de menu filtrees par utilisateur.
- `frontend/src/proxy.ts` : Ancien fichier proxy/middleware issu de la structure Next.js.

## Frontend - App Router conserve depuis Next.js

- `frontend/src/app/favicon.ico` : Icone du site; fichier binaire non commentable inline.
- `frontend/src/app/globals.css` : Variables CSS, theme global, tokens Tailwind/shadcn et typographie.
- `frontend/src/app/layout.jsx` : Layout racine conserve depuis Next.js.
- `frontend/src/app/page.jsx` : Page d'accueil conservee depuis l'ancienne structure Next.js.
- `frontend/src/app/api/auth/[...nextauth]/route.ts` : Route NextAuth historique; a remplacer cote Vite/FastAPI.
- `frontend/src/app/(auth)/login/page.jsx` : Page login historique de l'ancien App Router.
- `frontend/src/app/(dashboard)/layout.jsx` : Layout dashboard historique.
- `frontend/src/app/(dashboard)/admin/page.jsx` : Page tableau de bord admin.
- `frontend/src/app/(dashboard)/admin/users/page.jsx` : Page liste du personnel admin.
- `frontend/src/app/(dashboard)/admin/users/new/page.jsx` : Page creation utilisateur admin.
- `frontend/src/app/(dashboard)/admin/users/[id]/page.jsx` : Page detail/modification utilisateur admin.
- `frontend/src/app/(dashboard)/superadmin/page.jsx` : Page tableau de bord superadmin.
- `frontend/src/app/(dashboard)/superadmin/restaurants/page.jsx` : Page liste des restaurants superadmin.
- `frontend/src/app/(dashboard)/superadmin/restaurants/new/page.jsx` : Page creation restaurant superadmin.
- `frontend/src/app/(dashboard)/superadmin/restaurants/[id]/page.jsx` : Page detail/modification restaurant superadmin.
- `frontend/src/app/(dashboard)/serveur/page.jsx` : Page role serveur.
- `frontend/src/app/(dashboard)/cuisine/page.jsx` : Page role cuisine.
- `frontend/src/app/(dashboard)/caisse/page.jsx` : Page role caisse.
- `frontend/src/app/(dashboard)/stock/page.jsx` : Page role stock.
- `frontend/src/app/(dashboard)/comptable/page.jsx` : Page role comptable.

## Frontend - Authentification

- `frontend/src/features/auth/lib/permissions.ts` : Ancienne logique de permissions TypeScript cote Next.js.
- `frontend/src/features/auth/lib/role-routes.ts` : Mapping historique entre roles et routes autorisees.
- `frontend/src/features/auth/lib/session.ts` : Helpers historiques de session serveur Next.js.
- `frontend/src/features/auth/schemas/loginSchema.ts` : Schema de validation du formulaire login.
- `frontend/src/features/auth/actions/loginAction.ts` : Ancienne server action de connexion.
- `frontend/src/features/auth/actions/logoutAction.ts` : Ancienne server action de deconnexion.
- `frontend/src/features/auth/components/LoginForm.jsx` : Composant formulaire de connexion.

## Frontend - Restaurants

- `frontend/src/features/restaurants/actions/index.ts` : Anciennes server actions restaurant.
- `frontend/src/features/restaurants/repository/index.ts` : Ancien repository Prisma des restaurants.
- `frontend/src/features/restaurants/schemas/index.ts` : Schemas de validation restaurant.
- `frontend/src/features/restaurants/components/RestaurantForm.jsx` : Formulaire de creation/modification restaurant.
- `frontend/src/features/restaurants/components/RestaurantsTable.jsx` : Tableau d'affichage des restaurants.

## Frontend - Utilisateurs

- `frontend/src/features/users/actions/index.ts` : Anciennes server actions utilisateur.
- `frontend/src/features/users/repository/index.ts` : Ancien repository Prisma des utilisateurs.
- `frontend/src/features/users/schemas/index.ts` : Schemas de validation utilisateur.
- `frontend/src/features/users/components/UserForm.jsx` : Formulaire creation/modification utilisateur.
- `frontend/src/features/users/components/UsersTable.jsx` : Tableau d'affichage du personnel.

## Frontend - Composants partages

- `frontend/src/components/shared/Sidebar.jsx` : Barre laterale; utilise le menu centralise et filtre par role/permissions.
- `frontend/src/components/shared/RestaurantSwitcher.jsx` : Selecteur historique de restaurant pour superadmin.
- `frontend/src/components/shared/RoleBadge.jsx` : Badge visuel affichant le role utilisateur.

## Frontend - UI

- `frontend/src/components/ui/button.jsx` : Composant bouton reutilisable.
- `frontend/src/components/ui/input.jsx` : Composant champ texte reutilisable.
- `frontend/src/components/ui/label.jsx` : Composant label de formulaire.
- `frontend/src/components/ui/select.jsx` : Composant select reutilisable.
- `frontend/src/components/ui/badge.jsx` : Composant badge reutilisable.
- `frontend/src/components/ui/table.jsx` : Composants de table reutilisables.
- `frontend/src/components/ui/dropdown-menu.jsx` : Composants menu deroulant.
- `frontend/src/components/ui/sonner.jsx` : Integration des notifications/toasts.

## Frontend - Librairies internes

- `frontend/src/types/index.ts` : Types applicatifs et labels de roles historiques.
- `frontend/src/lib/auth.ts` : Configuration/exports historiques d'authentification NextAuth.
- `frontend/src/lib/auth.config.ts` : Configuration NextAuth historique.
- `frontend/src/lib/cookies.ts` : Constantes ou helpers de cookies.
- `frontend/src/lib/db.ts` : Ancien client Prisma cote serveur Next.js.
- `frontend/src/lib/env.ts` : Validation ou lecture des variables d'environnement frontend/serveur.
- `frontend/src/lib/errors.ts` : Erreurs applicatives reutilisables.
- `frontend/src/lib/logger.ts` : Logger applicatif.
- `frontend/src/lib/scoped-db.ts` : Helpers historiques d'acces DB scoped par tenant.
- `frontend/src/lib/utils.ts` : Fonctions utilitaires: classes CSS, formatage, slug, devise et initiales.

## Frontend - Tests

- `frontend/src/tests/setup.ts` : Initialisation de l'environnement de test.
- `frontend/src/tests/permissions.test.ts` : Tests historiques sur les permissions frontend.
- `frontend/src/tests/schemas.test.ts` : Tests historiques sur les schemas de validation.

## Frontend - Assets publics

- `frontend/public/file.svg` : Icone SVG statique.
- `frontend/public/globe.svg` : Icone SVG statique.
- `frontend/public/next.svg` : Logo Next.js historique.
- `frontend/public/vercel.svg` : Logo Vercel historique.
- `frontend/public/window.svg` : Icone SVG statique.

## Frontend - Prisma genere

- `frontend/src/generated/prisma/client.ts` : Client Prisma genere; ne pas modifier directement.
- `frontend/src/generated/prisma/browser.ts` : Build Prisma pour usage browser; genere automatiquement.
- `frontend/src/generated/prisma/enums.ts` : Enums Prisma generes, dont les roles historiques.
- `frontend/src/generated/prisma/models.ts` : Exports generes des modeles Prisma.
- `frontend/src/generated/prisma/commonInputTypes.ts` : Types d'entree Prisma generes.
- `frontend/src/generated/prisma/models/Restaurant.ts` : Types Prisma generes pour `Restaurant`.
- `frontend/src/generated/prisma/models/User.ts` : Types Prisma generes pour `User`.
- `frontend/src/generated/prisma/models/AuditLog.ts` : Types Prisma generes pour `AuditLog`.
- `frontend/src/generated/prisma/internal/class.ts` : Infrastructure interne generee par Prisma.
- `frontend/src/generated/prisma/internal/prismaNamespace.ts` : Namespace Prisma genere.
- `frontend/src/generated/prisma/internal/prismaNamespaceBrowser.ts` : Namespace Prisma genere pour browser.
