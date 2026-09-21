#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
if [[ -f internal/backend/.env ]]; then
  DB_PORT_VALUE="$(sed -n 's/^DB_PORT=//p' internal/backend/.env | tail -n1 | tr -d '\"' | tr -d '\r')"
  [[ -n "$DB_PORT_VALUE" ]] && export MYSQL_HOST_PORT="$DB_PORT_VALUE"
  DB_NAME_VALUE="$(sed -n 's/^DB_NAME=//p' internal/backend/.env | tail -n1 | tr -d '\"' | tr -d '\r')"
  DB_USER_VALUE="$(sed -n 's/^DB_USER=//p' internal/backend/.env | tail -n1 | tr -d '\"' | tr -d '\r')"
  DB_PASSWORD_VALUE="$(sed -n 's/^DB_PASSWORD=//p' internal/backend/.env | tail -n1 | tr -d '\"' | tr -d '\r')"
  [[ -n "$DB_NAME_VALUE" ]] && export MARIADB_DATABASE="$DB_NAME_VALUE"
  [[ -n "$DB_USER_VALUE" ]] && export MARIADB_USER="$DB_USER_VALUE"
  [[ -n "$DB_PASSWORD_VALUE" ]] && export MARIADB_PASSWORD="$DB_PASSWORD_VALUE"
fi
docker compose -f database/docker-compose.yml up -d
echo "MariaDB is starting. Check readiness with: docker compose -f database/docker-compose.yml ps"
