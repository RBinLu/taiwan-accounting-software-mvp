#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="$ROOT_DIR/storage/backups"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/accounting_dev-$STAMP.sql"

mkdir -p "$BACKUP_DIR"

COMPOSE_PROJECT_NAME=accounting_ocr docker-compose \
  -f "$ROOT_DIR/docker-compose.yml" \
  exec -T postgres \
  pg_dump -U accounting -d accounting_dev --no-owner --no-privileges \
  > "$BACKUP_FILE"

chmod 600 "$BACKUP_FILE"
printf '%s\n' "$BACKUP_FILE"
