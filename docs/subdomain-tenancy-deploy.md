# Déploiement multi-tenant par sous-domaines

Le frontend résout automatiquement le tenant depuis le host du navigateur.

## Routage attendu

- `restaurant.bloomarone.com` affiche la landing SaaS globale.
- `platform.bloomarone.com` affiche la connexion plateforme réservée au superadmin.
- `leboncoin.bloomarone.com` affiche la vitrine du restaurant `leboncoin`.
- `pouletmayo.bloomarone.com` affiche la vitrine du restaurant `pouletmayo`.

Les routes historiques `/r/:slug` restent disponibles pour le développement local.

## DNS

Configuration recommandée :

```text
restaurant.bloomarone.com  A  IP_DU_VPS
platform.bloomarone.com    A  IP_DU_VPS
*.bloomarone.com           A  IP_DU_VPS
```

Si le wildcard DNS n'est pas disponible, créez chaque sous-domaine manuellement.

## Nginx frontal

Exemple de reverse-proxy devant le conteneur frontend :

```nginx
server {
    listen 80;
    server_name restaurant.bloomarone.com platform.bloomarone.com *.bloomarone.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Le Nginx embarqué dans le conteneur frontend conserve déjà le `Host` et proxy `/api/` vers FastAPI.

## HTTPS

Utilisez un certificat couvrant :

- `restaurant.bloomarone.com`
- `platform.bloomarone.com`
- `*.bloomarone.com`

Un certificat wildcard via challenge DNS est recommandé.

## Variables frontend

Si vous changez de domaine :

```env
VITE_SAAS_HOST=restaurant.bloomarone.com
VITE_PLATFORM_HOST=platform.bloomarone.com
VITE_BASE_DOMAIN=bloomarone.com
```

Le backend doit reconnaître les hosts publics réservés à la plateforme :

```env
TENANT_BASE_DOMAIN=bloomarone.com
TENANT_PLATFORM_HOSTS=restaurant.bloomarone.com,www.restaurant.bloomarone.com,platform.bloomarone.com,www.platform.bloomarone.com
```

Si l'API reste servie par le même domaine via `/api`, gardez :

```env
VITE_API_URL=/
```

## Tests production

1. Ouvrir `restaurant.bloomarone.com`.
2. Ouvrir `platform.bloomarone.com` et vérifier que seul le login superadmin est affiché.
3. Ouvrir un sous-domaine restaurant existant.
4. Ouvrir un sous-domaine inconnu.
5. Suspendre un restaurant et vérifier la page d'indisponibilité.
6. Vérifier que `/login` sur un sous-domaine restaurant ouvre la connexion du restaurant.

## Test local avec faux sous-domaines

Ajoutez temporairement ces lignes dans `/etc/hosts` :

```text
127.0.0.1 restaurant.bloomarone.com
127.0.0.1 platform.bloomarone.com
127.0.0.1 leboncoin.bloomarone.com
127.0.0.1 pouletmayo.bloomarone.com
```

Lancez le projet en développement, puis ouvrez :

```text
http://restaurant.bloomarone.com:5177
http://platform.bloomarone.com:5177
http://leboncoin.bloomarone.com:5177
```

Avec Docker Compose dev, le port exposé côté machine est généralement `5177`.
Avec `npm run dev` lancé directement dans `frontend`, utilisez plutôt :

```text
http://restaurant.bloomarone.com:5173
http://platform.bloomarone.com:5173
http://leboncoin.bloomarone.com:5173
```

La configuration Vite autorise par défaut tous les hosts en développement pour faciliter les tests de sous-domaines. Pour restreindre explicitement :

```env
VITE_DEV_ALLOWED_HOSTS=.bloomarone.com,localhost,127.0.0.1
```
