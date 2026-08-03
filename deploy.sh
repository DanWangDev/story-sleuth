#!/usr/bin/env bash
# One-command production deploy for story-sleuth.
#
# Usage:   ./deploy.sh
# Rollback: IMAGE_TAG=<commit-sha> ./deploy.sh
#
# Uses shared labf-db PostgreSQL (see DanWangDev/labf-infra).
# Cloudflare Tunnel runs as a separate NAS container.

set -euo pipefail

# Prefer docker-compose (Synology DSM) over docker compose (Docker plugin)
if command -v docker-compose >/dev/null 2>&1; then
  COMPOSE="docker-compose"
else
  COMPOSE="docker compose"
fi

cd "$(dirname "$0")"

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env"

if [ ! -f "$ENV_FILE" ]; then
  echo "deploy: $ENV_FILE not found — copy .env.example and fill it in first." >&2
  exit 1
fi

# Check critical vars
missing=""
set -o allexport; source "$ENV_FILE"; set +o allexport
for var in OIDC_CLIENT_SECRET SESSION_SECRET ADMIN_ENCRYPTION_KEY; do
  eval "val=\${$var:-}"
  if [ -z "$val" ] || echo "$val" | grep -q "^replace-me"; then
    missing="$missing $var"
  fi
done
if [ -n "$missing" ]; then
  echo "deploy: the following env vars are unset or still the placeholder:" >&2
  for v in $missing; do
    echo "  - $v" >&2
  done
  exit 1
fi

IMAGE_TAG="${IMAGE_TAG:-latest}"
echo "deploy: using IMAGE_TAG=$IMAGE_TAG"

echo "deploy: pulling images..."
$COMPOSE -f "$COMPOSE_FILE" pull

echo "deploy: running migrations..."
$COMPOSE -f "$COMPOSE_FILE" run --rm --no-deps \
  --entrypoint "" backend \
  node dist/db/migrate-cli.js

echo "deploy: bringing up backend + frontend..."
$COMPOSE -f "$COMPOSE_FILE" up -d backend frontend

echo "deploy: waiting for backend health..."
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do
  if $COMPOSE -f "$COMPOSE_FILE" exec -T backend wget -qO- http://localhost:5060/api/health >/dev/null 2>&1; then
    echo "deploy: backend is healthy."
    break
  fi
  sleep 2
  if [ "$i" -eq 30 ]; then
    echo "deploy: backend failed to become healthy in 60s." >&2
    $COMPOSE -f "$COMPOSE_FILE" logs --tail=80 backend >&2
    exit 1
  fi
done

echo ""
echo "deploy: done."
$COMPOSE -f "$COMPOSE_FILE" ps
