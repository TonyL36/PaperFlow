#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="${1:-docker/compose.dev.yml}"

echo "Applying PaperFlow knowledge database schema using ${COMPOSE_FILE} ..."
docker compose -f "${COMPOSE_FILE}" exec -T postgres psql -U postgres -d postgres -f /docker-entrypoint-initdb.d/02-paperflowdb.sql
echo "PaperFlow knowledge database schema applied."
