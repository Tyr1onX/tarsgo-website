#!/usr/bin/env bash
set -Eeuo pipefail

# Required environment: DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD
# Optional: BACKUP_DIR (default: ./backups)

: "${DB_HOST:?DB_HOST is required}"
: "${DB_PORT:?DB_PORT is required}"
: "${DB_NAME:?DB_NAME is required}"
: "${DB_USER:?DB_USER is required}"
: "${DB_PASSWORD:?DB_PASSWORD is required}"

command -v mariadb-dump >/dev/null 2>&1 || {
  echo "mariadb-dump is required" >&2
  exit 1
}
command -v gzip >/dev/null 2>&1 || {
  echo "gzip is required" >&2
  exit 1
}
command -v sha256sum >/dev/null 2>&1 || {
  echo "sha256sum is required" >&2
  exit 1
}

backup_dir="${BACKUP_DIR:-./backups}"
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
base="$backup_dir/${DB_NAME}_${timestamp}"
tmp_cnf="$(mktemp)"
tmp_dump="${base}.sql.gz.tmp"
cleanup() {
  rm -f "$tmp_cnf" "$tmp_dump"
}
trap cleanup EXIT

umask 077
cat >"$tmp_cnf" <<EOF
[client]
host=${DB_HOST}
port=${DB_PORT}
user=${DB_USER}
password=${DB_PASSWORD}
default-character-set=utf8mb4
EOF
chmod 600 "$tmp_cnf"

mariadb-dump \
  --defaults-extra-file="$tmp_cnf" \
  --single-transaction \
  --quick \
  --routines \
  --events \
  --triggers \
  --hex-blob \
  "$DB_NAME" | gzip -9 >"$tmp_dump"

gzip -t "$tmp_dump"
mv "$tmp_dump" "${base}.sql.gz"
sha256sum "${base}.sql.gz" >"${base}.sha256"

echo "Backup created: ${base}.sql.gz"
echo "Checksum created: ${base}.sha256"
