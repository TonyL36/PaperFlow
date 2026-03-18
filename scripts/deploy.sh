#!/usr/bin/env bash
set -euo pipefail

ENV_NAME="${1:-dev}"
case "$ENV_NAME" in
  dev|test|prod) ;;
  *) echo "usage: $0 {dev|test|prod}" >&2; exit 1;;
esac

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT_DIR}/docker/compose.${ENV_NAME}.yml"
ENV_FILE="${ROOT_DIR}/docker/env/${ENV_NAME}.env"

test -f "$COMPOSE_FILE"
test -f "$ENV_FILE"

cd "$ROOT_DIR"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build

