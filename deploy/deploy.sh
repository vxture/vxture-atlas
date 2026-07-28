#!/usr/bin/env bash
# On-host deployment lifecycle for the atlas production stack. Invoked by CI
# (deploy.yml / rollback.yml) after the image build.
#
#   bash deploy.sh all       # directories -> start -> verify -> prune
#   bash deploy.sh start     # pull image (primary, then fallback) + up -d
#   bash deploy.sh verify    # health check
#   bash deploy.sh prune     # remove unreferenced images (frees old sha-* tags)
#
# The image tag + registries come from the environment CI sets:
#   IMAGE_REGISTRY / IMAGE_NAMESPACE / IMAGE_TAG (primary),
#   FALLBACK_IMAGE_REGISTRY / FALLBACK_IMAGE_NAMESPACE (fallback).
# worker-02: ACR primary / GHCR fallback (owner decision 2026-07-26, deviates
# from governance section 5's non-VPC default - see deploy.yml and
# docs/50-deployment/00-index.md).
#
# Memory-constrained hosts (governance section 4): if the assigned deploy host
# is a 2C2G-class box (not a data-array box with room for old+new containers),
# switch cmd_start to per-service `pull + up -d --no-deps` instead of the
# full-stack pull/up below.
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DEPLOY_DIR/.." && pwd)"     # /srv/md0/atlas on worker-02 - see docs/50-deployment/00-index.md
ENV_FILE="$ROOT/etc/.env"
# Provider API keys live in a separate, never-CI-bootstrapped file (operator
# creates it manually via SSH, chmod 400) - stricter permissions and a
# narrower blast radius than the general operator .env. Optional: compose's
# `required: false` means its absence is fine (e.g. before an operator has
# onboarded any provider key yet).
PROVIDER_KEYS_ENV_FILE="$ROOT/etc/.env.provider-keys"
COMPOSE_FILE="$DEPLOY_DIR/docker-compose.yml"

# Product code: from the environment (CI passes PRODUCT_CODE), else the
# atlas literal.
PRODUCT_CODE="${PRODUCT_CODE:-atlas}"
IMAGE_NAME="${PRODUCT_CODE}-app"
PROJECT_NAME="${PRODUCT_CODE}"
APP_PORT="3100"
# Persistent data lives OUTSIDE the deploy dir (which is rsync --delete'd on every
# deploy) - container-written data is root-owned and would otherwise break the
# next deploy's rsync. Absolute path under the stack root.
DATA_DIR="${DATA_DIR:-$ROOT/data}"

log() { echo "[deploy] $*"; }

compose() {
  PRODUCT_CODE="$PRODUCT_CODE" \
  PROJECT_NAME="$PROJECT_NAME" \
  DATA_DIR="$DATA_DIR" \
  APP_ENV_FILE="$ENV_FILE" \
  APP_PROVIDER_KEYS_ENV_FILE="$PROVIDER_KEYS_ENV_FILE" \
  IMAGE_REGISTRY="${IMAGE_REGISTRY:-ghcr.io}" \
  IMAGE_NAMESPACE="${IMAGE_NAMESPACE:-vxture}" \
  IMAGE_TAG="${IMAGE_TAG:-latest}" \
  docker compose --project-name "$PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

cmd_environment() {
  test -f "$ENV_FILE" || { log "missing $ENV_FILE"; exit 1; }
  test -f "$COMPOSE_FILE" || { log "missing $COMPOSE_FILE"; exit 1; }
  log "environment OK ($ROOT)"
}

cmd_directories() {
  mkdir -p "$DATA_DIR/db"
  log "directories ready ($DATA_DIR)"
}

cmd_start() {
  local reg="${IMAGE_REGISTRY:-ghcr.io}" ns="${IMAGE_NAMESPACE:-vxture}" tag="${IMAGE_TAG:-latest}"
  local primary="${reg}/${ns}/${IMAGE_NAME}:${tag}"
  log "pulling ${primary}"
  if ! docker pull "$primary"; then
    local fb="${FALLBACK_IMAGE_REGISTRY:-}/${FALLBACK_IMAGE_NAMESPACE:-}/${IMAGE_NAME}:${tag}"
    log "primary pull failed; trying fallback ${fb}"
    docker pull "$fb"
    docker tag "$fb" "$primary"
  fi
  compose pull db || true
  compose up -d
  log "started"
}

cmd_verify() {
  local tries=0
  until [ "$tries" -ge 20 ]; do
    if docker exec "${PROJECT_NAME}-app" wget -qO- "http://127.0.0.1:${APP_PORT}/healthz" >/dev/null 2>&1; then
      log "verify OK (health 200)"
      return 0
    fi
    tries=$((tries + 1))
    sleep 3
  done
  log "verify FAILED: /healthz not healthy"
  compose ps
  exit 1
}

cmd_prune() {
  # Every deploy pushes/pulls a new immutable sha-<short> app image tag
  # (build.yml) - without cleanup these accumulate on the host disk forever.
  # `docker image prune -af` (not `-a` alone) removes only images with no
  # container referencing them - the currently-running tag is never a
  # candidate, so this is safe to run unconditionally after a verified deploy.
  docker image prune -af >/dev/null 2>&1 || true
  log "pruned unreferenced images"
}

cmd_all() {
  cmd_environment
  cmd_directories
  cmd_start
  cmd_verify
  cmd_prune
}

case "${1:-}" in
  all)         cmd_all ;;
  environment) cmd_environment ;;
  directories) cmd_directories ;;
  start)       cmd_start ;;
  verify)      cmd_verify ;;
  prune)       cmd_prune ;;
  *) echo "usage: bash deploy.sh {all|environment|directories|start|verify|prune}"; exit 1 ;;
esac
