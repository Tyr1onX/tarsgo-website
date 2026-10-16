#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

if (( $# > 1 )); then
  echo "usage: backup-production.sh [--local-only|--offsite]" >&2
  exit 2
fi
case "${1:-}" in
  --local-only) backup_mode=local ;;
  ""|--offsite) backup_mode=offsite ;;
  *)
    echo "usage: backup-production.sh [--local-only|--offsite]" >&2
    exit 2
    ;;
esac

jijia_root="${JIJIA_ROOT:-/opt/jijia}"
backup_dir="${JIJIA_BACKUP_DIR:-$jijia_root/backups}"
remote_alias="${JIJIA_BACKUP_REMOTE:-tencent-backup}"
incoming_dir="${JIJIA_BACKUP_INCOMING:-/var/lib/jijia-backup/incoming}"
ssh_config="${JIJIA_BACKUP_SSH_CONFIG:-/root/.ssh/jijia-backup-ssh-config}"
docker_bin="${DOCKER_BIN:-docker}"
ssh_bin="${SSH_BIN:-ssh}"
scp_bin="${SCP_BIN:-scp}"
retention_minutes=10080

run_ssh() {
  if [[ -n "$ssh_config" && -f "$ssh_config" ]]; then
    "$ssh_bin" -F "$ssh_config" "$@"
  else
    "$ssh_bin" "$@"
  fi
}

run_scp() {
  if [[ -n "$ssh_config" && -f "$ssh_config" ]]; then
    "$scp_bin" -F "$ssh_config" "$@"
  else
    "$scp_bin" "$@"
  fi
}

for required in "$jijia_root/compose.yaml" "$jijia_root/.env" "$jijia_root/app.env" "$jijia_root/data/upload"; do
  if [[ ! -e "$required" ]]; then
    echo "Production backup aborted: required path is missing: $required" >&2
    exit 1
  fi
done

mkdir -p "$backup_dir"
chmod 0700 "$backup_dir"
stage_dir="$(mktemp -d "$backup_dir/.jijia-backup.XXXXXXXX")"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_name="jijia-full-${stamp}.tar.gz"
archive_path="$backup_dir/$backup_name"
checksum_path="$archive_path.sha256"
archive_tmp="$archive_path.tmp"

cleanup() {
  status=$?
  rm -rf -- "$stage_dir"
  if [[ -f "$archive_tmp" ]]; then
    rm -f -- "$archive_tmp"
  fi
  if [[ $status -ne 0 ]]; then
    rm -f -- "$archive_path" "$checksum_path"
  fi
  exit "$status"
}
trap cleanup EXIT

if [[ -e "$archive_path" || -e "$checksum_path" ]]; then
  echo "Production backup aborted: backup already exists: $backup_name" >&2
  exit 1
fi

(
  cd "$jijia_root"
  "$docker_bin" compose exec -T db sh -c 'MYSQL_PWD="$MARIADB_ROOT_PASSWORD" exec mariadb-dump -uroot --single-transaction --routines --events --triggers --databases "$MARIADB_DATABASE"' | gzip -9 >"$stage_dir/database.sql.gz"
)
tar -C "$jijia_root/data" -czf "$stage_dir/uploads.tar.gz" upload
cp -- "$jijia_root/compose.yaml" "$stage_dir/compose.yaml"
cp -- "$jijia_root/.env" "$stage_dir/.env"
cp -- "$jijia_root/app.env" "$stage_dir/app.env"
chmod 0600 "$stage_dir"/*

gzip -t "$stage_dir/database.sql.gz" "$stage_dir/uploads.tar.gz"
tar -czf "$archive_tmp" -C "$stage_dir" database.sql.gz uploads.tar.gz compose.yaml .env app.env
gzip -t "$archive_tmp"
tar -tzf "$archive_tmp" >/dev/null
chmod 0600 "$archive_tmp"
mv -- "$archive_tmp" "$archive_path"
(cd "$backup_dir" && sha256sum -- "$backup_name" >"$checksum_path")
chmod 0600 "$checksum_path"
(
  cd "$backup_dir"
  sha256sum --check -- "$backup_name.sha256"
)

if [[ "$backup_mode" == offsite ]]; then
  run_scp -o BatchMode=yes "$archive_path" "$checksum_path" "$remote_alias:$incoming_dir/"
  run_ssh -o BatchMode=yes "$remote_alias" sudo -n /usr/local/sbin/jijia-backup-accept "$backup_name"
fi

retain_local_backups() {
  local pattern expired_archive
  for pattern in 'jijia-full-*.tar.gz' 'jijia-*.sql.gz' 'uploads-*.tar.gz' 'compose-before-*.yaml'; do
    while IFS= read -r -d '' expired_archive; do
      rm -f -- "$expired_archive" "$expired_archive.sha256"
    done < <(find "$backup_dir" -maxdepth 1 -type f -name "$pattern" -mmin "+$retention_minutes" -print0)
  done
}

retain_local_backups
if [[ "$backup_mode" == offsite ]]; then
  echo "Production backup verified locally and on Tencent; 7-day local retention completed: $backup_name"
else
  echo "Production backup verified locally (Tencent transfer skipped); 7-day local retention completed: $backup_name"
fi
