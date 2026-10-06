#!/usr/bin/env bash
set -Eeuo pipefail

backup_store="${JIJIA_BACKUP_STORE:-/opt/backups/jijia}"
incoming_dir="${JIJIA_BACKUP_INCOMING:-/var/lib/jijia-backup/incoming}"
retention_minutes=43200
backup_owner="${JIJIA_BACKUP_OWNER:-root}"
backup_group="${JIJIA_BACKUP_GROUP:-root}"

if [[ $# -ne 1 ]]; then
  echo "usage: accept-production-backup.sh <backup-name>" >&2
  exit 2
fi

backup_name="$1"
if [[ ! "$backup_name" =~ ^jijia-full-[0-9]{8}T[0-9]{6}Z[.]tar[.]gz$ ]]; then
  echo "invalid backup name" >&2
  exit 2
fi

incoming_archive="$incoming_dir/$backup_name"
incoming_checksum="$incoming_archive.sha256"
if [[ ! -f "$incoming_archive" || -L "$incoming_archive" || ! -f "$incoming_checksum" || -L "$incoming_checksum" ]]; then
  echo "incoming backup or checksum is missing" >&2
  exit 1
fi

mkdir -p "$backup_store"
chmod 0700 "$backup_store"
chmod 0700 "$incoming_dir"

archive_path="$backup_store/$backup_name"
checksum_path="$archive_path.sha256"
if [[ -e "$archive_path" || -e "$checksum_path" ]]; then
  echo "backup already exists: $backup_name" >&2
  exit 1
fi

cleanup_partial() {
  status=$?
  if [[ $status -ne 0 ]]; then
    rm -f -- "$archive_path" "$checksum_path"
  fi
  exit "$status"
}
trap cleanup_partial EXIT

install -o "$backup_owner" -g "$backup_group" -m 0600 "$incoming_archive" "$archive_path"
install -o "$backup_owner" -g "$backup_group" -m 0600 "$incoming_checksum" "$checksum_path"
read -r manifest_hash manifest_name <"$checksum_path" || true
if [[ ! "$manifest_hash" =~ ^[[:xdigit:]]{64}$ || "$manifest_name" != "$backup_name" || "$(wc -l <"$checksum_path")" -ne 1 ]]; then
  echo "invalid checksum manifest" >&2
  exit 1
fi

(cd "$backup_store" && sha256sum --check -- "$backup_name.sha256")

while IFS= read -r -d '' expired_archive; do
  rm -f -- "$expired_archive" "$expired_archive.sha256"
done < <(find "$backup_store" -maxdepth 1 -type f -name 'jijia-full-*.tar.gz' -mmin "+$retention_minutes" -print0)

trap - EXIT
rm -f -- "$incoming_archive" "$incoming_checksum"
echo "Remote backup verified and 30-day retention completed: $backup_name"
