#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_FILE="${1:-}"

if [[ -z "$BACKUP_FILE" ]]; then
  printf 'usage: npm run db:restore -- storage/backups/accounting_dev-YYYYMMDD-HHMMSS.sql\n' >&2
  exit 2
fi

case "$BACKUP_FILE" in
  "$ROOT_DIR"/storage/backups/*|storage/backups/*) ;;
  *)
    printf 'restore file must be under storage/backups\n' >&2
    exit 2
    ;;
esac

if [[ ! -f "$BACKUP_FILE" ]]; then
  printf 'backup file not found: %s\n' "$BACKUP_FILE" >&2
  exit 2
fi

COMPOSE_PROJECT_NAME=accounting_ocr docker-compose \
  -f "$ROOT_DIR/docker-compose.yml" \
  exec -T postgres \
  psql -U accounting -d accounting_dev \
  < "$BACKUP_FILE"
