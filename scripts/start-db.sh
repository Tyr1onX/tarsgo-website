#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
if ! command -v docker >/dev/null 2>&1; then
  echo "Cannot start the local database: Docker Compose v2 is required." >&2
  exit 127
fi
ready_timeout="${DB_READY_TIMEOUT:-120}"
if [[ ! "$ready_timeout" =~ ^[1-9][0-9]*$ ]]; then
  echo "DB_READY_TIMEOUT must be a positive number of seconds." >&2
  exit 2
fi
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
if ! docker compose -f database/docker-compose.yml up -d --wait --wait-timeout "$ready_timeout"; then
  echo "MariaDB did not become healthy within ${ready_timeout}s. Check Docker Desktop and the container logs." >&2
  exit 1
fi
echo "MariaDB is healthy and ready on 127.0.0.1:${MYSQL_HOST_PORT:-3307}."
