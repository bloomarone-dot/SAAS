# Déploiement production (Hostinger VPS)

Stack : **Docker Compose** (`docker-compose.prod.yml`) — MySQL + backend FastAPI + frontend nginx.

## Chemin recommandé sur le serveur

```bash
/opt/SAAS
```

## Première installation

```bash
mkdir -p /opt/SAAS
cd /opt/SAAS
git clone https://github.com/bloomarone-dot/SAAS.git .

cp .env.prod.example .env
nano .env   # mots de passe, SECRET_KEY, SUPERADMIN_*, CORS, APP_PUBLIC_URL

# Ne pas utiliser l'override de dev en production
mv docker-compose.override.yml docker-compose.override.yml.bak 2>/dev/null || true

docker compose -f docker-compose.prod.yml up --build -d
docker compose -f docker-compose.prod.yml ps
```

Si le port **80** est déjà pris (nginx système, autre app), dans `.env` :

```env
HTTP_PORT=8080
```

Puis accès : `http://VOTRE_IP:8080`

## Mise à jour (après un `git push`)

```bash
cd /opt/SAAS
git pull origin main
bash scripts/update-hostinger.sh
```

Les données MySQL restent dans le volume Docker `mysql_data`.

## Variables importantes (`.env`)

| Variable | Description |
|----------|-------------|
| `MYSQL_*` | Base de données |
| `SECRET_KEY` | JWT / sessions (32+ caractères aléatoires) |
| `CORS_ALLOWED_ORIGINS` | URL publique du frontend (https://…) |
| `APP_PUBLIC_URL` | URL publique du backend (webhooks Mobile Money) |
| `HTTP_PORT` | Port hôte du frontend (défaut `80`) |
| `SUPERADMIN_*` | Compte superadmin initial |

## Vérifications

```bash
cd /opt/SAAS
docker compose -f docker-compose.prod.yml ps
curl -I http://127.0.0.1:${HTTP_PORT:-80}/
docker compose -f docker-compose.prod.yml logs -f backend --tail=50
```

## HTTPS / domaine

Placez un reverse-proxy nginx ou Caddy sur le VPS devant le port `HTTP_PORT`, par exemple :

- `https://restaurant.bloomarone.com` → `http://127.0.0.1:8080`

Mettez à jour `CORS_ALLOWED_ORIGINS` et `APP_PUBLIC_URL` avec le domaine HTTPS.
