#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_USER="${DB_APP_USER:-accounting_app}"
APP_PASSWORD="${DB_APP_PASSWORD:-}"

if [[ ! "$APP_USER" =~ ^[A-Za-z_][A-Za-z0-9_]{0,62}$ ]]; then
  printf 'DB_APP_USER must be a valid PostgreSQL identifier\n' >&2
  exit 2
fi

if [[ -z "$APP_PASSWORD" ]]; then
  printf 'DB_APP_PASSWORD is required\n' >&2
  exit 2
fi

APP_PASSWORD_SQL="${APP_PASSWORD//\'/\'\'}"

COMPOSE_PROJECT_NAME=accounting_ocr docker-compose \
  -f "$ROOT_DIR/docker-compose.yml" \
  exec -T postgres \
  psql -U accounting -d accounting_dev <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_USER}') THEN
    CREATE ROLE ${APP_USER} LOGIN PASSWORD '${APP_PASSWORD_SQL}';
  ELSE
    ALTER ROLE ${APP_USER} WITH PASSWORD '${APP_PASSWORD_SQL}';
  END IF;
END
\$\$;

REVOKE ALL ON DATABASE accounting_dev FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE accounting_dev TO ${APP_USER};
GRANT USAGE ON SCHEMA public TO ${APP_USER};
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_USER};
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${APP_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO ${APP_USER};
SQL

printf 'runtime role ready: %s\n' "$APP_USER"
