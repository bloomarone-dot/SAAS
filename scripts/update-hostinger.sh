#!/usr/bin/env bash
# Mise à jour Hostinger — Restaurant SaaS (conserve les données MySQL).
#
# Usage :
#   cd /opt/SAAS
#   bash scripts/update-hostinger.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
COMPOSE="docker compose -f docker-compose.prod.yml"

echo "=========================================="
echo "  Mise à jour Restaurant SaaS (Hostinger)"
echo "=========================================="
echo "Répertoire : $ROOT"
echo

if [[ ! -f .env ]]; then
  echo "ERREUR : fichier .env manquant."
  echo "  cp .env.prod.example .env"
  echo "  nano .env   # puis relancer ce script"
  exit 1
fi

if [[ -f docker-compose.override.yml ]]; then
  echo "→ Override dev détecté — désactivation pour la prod..."
  mv docker-compose.override.yml "docker-compose.override.yml.bak.$(date +%Y%m%d%H%M%S)"
fi

echo "→ git pull origin main..."
git pull origin main

echo "→ Sauvegarde MySQL (optionnelle)..."
if $COMPOSE ps db 2>/dev/null | grep -q Up; then
  STAMP="$(date +%Y%m%d-%H%M%S)"
  mkdir -p backups
  source .env
  $COMPOSE exec -T db mysqldump -u"${MYSQL_USER}" -p"${MYSQL_PASSWORD}" "${MYSQL_DATABASE}" \
    > "backups/pre-update-${STAMP}.sql" 2>/dev/null \
    && echo "  Backup : backups/pre-update-${STAMP}.sql" \
    || echo "  (backup ignoré)"
fi

echo "→ Infrastructure (base de données)..."
$COMPOSE up -d db
sleep 15

echo "→ Rebuild backend + frontend..."
$COMPOSE build --no-cache backend frontend
$COMPOSE up -d

sleep 20
echo
echo "→ Vérifications..."
HTTP_PORT="${HTTP_PORT:-80}"
curl -sf "http://127.0.0.1:${HTTP_PORT}/" >/dev/null && echo "  Frontend : OK" || echo "  Frontend : ERREUR"
$COMPOSE exec -T backend python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)" >/dev/null 2>&1 \
  && echo "  Backend : OK" \
  || echo "  Backend : vérifier les logs"
$COMPOSE ps

echo
echo "✓ Mise à jour terminée."
echo "  Port local : http://127.0.0.1:${HTTP_PORT}/"
echo "  Logs : docker compose -f docker-compose.prod.yml logs -f --tail=80"
