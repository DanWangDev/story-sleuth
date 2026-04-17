#!/usr/bin/env bash
# One-command production deploy for story-sleuth.
#
# Usage:   ./deploy.sh
# Rollback: IMAGE_TAG=<commit-sha> ./deploy.sh
#
# Requires: docker, docker compose, .env populated from .env.example.
#
# Flow:
#   1. Pull latest images from GHCR (or a pinned IMAGE_TAG).
#   2. Start Postgres + wait for it to be healthy.
#   3. Run migrations via a one-shot backend container.
#   4. Bring up backend, frontend, cloudflared.
#   5. Wait for /api/health to return 200, then print a summary.
#
# Exits non-zero on any step that fails so systemd/cron retries stay sane.

set -euo pipefail

cd "$(dirname "$0")"

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "deploy: $ENV_FILE not found — copy .env.example and fill it in first." >&2
  exit 1
fi

# Check critical vars are set (compose's ${VAR:?msg} would also catch these,
# but a clearer up-front message is kinder than a mid-pull failure).
missing=()
# shellcheck disable=SC1090
set -o allexport; source "$ENV_FILE"; set +o allexport
for var in POSTGRES_PASSWORD CLOUDFLARE_TUNNEL_TOKEN OIDC_CLIENT_SECRET \
           SESSION_SECRET ADMIN_ENCRYPTION_KEY; do
  if [[ -z "${!var:-}" || "${!var}" == "replace-me"* ]]; then
    missing+=("$var")
  fi
done
if (( ${#missing[@]} > 0 )); then
  echo "deploy: the following env vars are unset or still the placeholder:" >&2
  printf '  - %s\n' "${missing[@]}" >&2
  exit 1
fi

IMAGE_TAG="${IMAGE_TAG:-latest}"
echo "deploy: using IMAGE_TAG=$IMAGE_TAG"

echo "deploy: pulling images..."
docker compose -f "$COMPOSE_FILE" pull

echo "deploy: starting postgres..."
docker compose -f "$COMPOSE_FILE" up -d postgres
# docker compose won't return until the healthcheck reports healthy when
# another service depends on it with condition: service_healthy, but the
# explicit wait makes failure noisy here instead of inside the migrate run.
echo "deploy: waiting for postgres to be healthy..."
for i in {1..30}; do
  if docker compose -f "$COMPOSE_FILE" ps postgres --format '{{.Health}}' \
        | grep -q healthy; then
    echo "deploy: postgres is healthy."
    break
  fi
  sleep 2
  if (( i == 30 )); then
    echo "deploy: postgres failed to become healthy in 60s. Check logs:" >&2
    docker compose -f "$COMPOSE_FILE" logs --tail=50 postgres >&2
    exit 1
  fi
done

echo "deploy: running migrations..."
# Use --rm + --no-deps so we don't spin up the long-running backend
# service by accident. The migrate:prod script reads DATABASE_URL from
# the same env the backend uses.
docker compose -f "$COMPOSE_FILE" run --rm --no-deps \
  --entrypoint "" backend \
  node dist/db/migrate-cli.js

echo "deploy: bringing up backend + frontend + tunnel..."
docker compose -f "$COMPOSE_FILE" up -d backend frontend cloudflared

echo "deploy: waiting for backend health..."
for i in {1..30}; do
  if docker compose -f "$COMPOSE_FILE" ps backend --format '{{.Health}}' \
        | grep -q healthy; then
    echo "deploy: backend is healthy."
    break
  fi
  sleep 2
  if (( i == 30 )); then
    echo "deploy: backend failed to become healthy in 60s. Last logs:" >&2
    docker compose -f "$COMPOSE_FILE" logs --tail=80 backend >&2
    exit 1
  fi
done

echo ""
echo "deploy: done."
docker compose -f "$COMPOSE_FILE" ps
