# Frontend modules

Organisation cible par domaine metier:

- `platform`: vues globales superadmin (proprietaires, abonnements, sante plateforme, parametres).
- `restaurants`: provisioning et gestion des restaurants / tenants.
- `auth`: connexion, session et permissions.
- `users`: personnel, roles et permissions restaurant.
- `admin`: branches, personnel, permissions et catalogue menu du proprietaire.
- `stock`: stock, inventaires, mouvements, achats, pertes, exports et comptabilite stock.
- `operations`: service, cuisine et caisse.

Les modules historiques sous `features/*` restent compatibles pendant la migration.
