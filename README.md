# Restaurant SaaS - Real Frontend Merge

Ce projet contient :
- le vrai frontend du projet Next.js envoyé
- un backend FastAPI séparé
- la structure SaaS

Le frontend n'a pas été remplacé par un faux dashboard.
La structure réelle du projet original a été conservée.

## Paiements Mobile Money

Le backend prend en charge Orange Money et MTN Mobile Money avec Push USSD,
verrouillage de facture, webhook HMAC idempotent, ventilation financière et
réconciliation périodique.

Variables obligatoires en production :

- `APP_PUBLIC_URL` : URL HTTPS publique utilisée pour les callbacks.
- `ORANGE_*` et `MTN_*` : identifiants fournis par l'agrégateur.
- `ORANGE_WEBHOOK_SECRET` et `MTN_WEBHOOK_SECRET` : secrets HMAC distincts.
- `ORANGE_WEBHOOK_ALLOWED_IPS` et `MTN_WEBHOOK_ALLOWED_IPS` : plages IP/CIDR
  autorisées, séparées par des virgules.

L'agrégateur doit signer le corps JSON brut avec HMAC-SHA256 et transmettre la
signature dans `X-Webhook-Signature` (préfixe `sha256=` accepté). Une réponse
synchrone d'initiation ou une consultation de statut ne solde jamais la facture.
