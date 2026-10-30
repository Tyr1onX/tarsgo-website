#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target="${DEPLOY_TARGET:-racknerd}"
jijia_root="${JIJIA_ROOT:-/opt/jijia}"
ssh_bin="${SSH_BIN:-ssh}"
rsync_bin="${RSYNC_BIN:-rsync}"
make_bin="${MAKE_BIN:-make}"
require_offsite_backup="${DEPLOY_REQUIRE_OFFSITE_BACKUP:-0}"
if [[ "$require_offsite_backup" != 0 && "$require_offsite_backup" != 1 ]]; then
  echo "Production deploy aborted: DEPLOY_REQUIRE_OFFSITE_BACKUP must be 0 or 1." >&2
  exit 2
fi

if [[ "$(git -C "$repo_root" rev-parse --is-inside-work-tree)" != true || -n "$(git -C "$repo_root" status --porcelain)" ]]; then
  echo "Production deploy aborted: run from a clean Git working tree." >&2
  exit 1
fi
public_file_count=0
missing_public_files=()
while IFS= read -r -d '' public_path; do
  ((public_file_count += 1))
  [[ -f "$repo_root/$public_path" ]] || missing_public_files+=("$public_path")
done < <(git -C "$repo_root" ls-files -z -- public)
if (( public_file_count == 0 || ${#missing_public_files[@]} > 0 )); then
  echo "Production deploy aborted: tracked public/ build assets are missing from the working tree; materialize the complete public/ directory before building." >&2
  if ((${#missing_public_files[@]} > 0)); then
    printf 'missing_public_asset=%s\n' "${missing_public_files[@]:0:10}" >&2
  fi
  (( public_file_count > 0 )) || echo 'missing_public_asset_count=0' >&2
  exit 1
fi
git -C "$repo_root" fetch origin main >/dev/null
commit_sha="$(git -C "$repo_root" rev-parse HEAD)"
main_sha="$(git -C "$repo_root" rev-parse origin/main)"
if [[ "$commit_sha" != "$main_sha" || ! "$commit_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Production deploy aborted: checkout must match the latest origin/main commit." >&2
  exit 1
fi
short_sha="${commit_sha:0:7}"

state="$("$ssh_bin" -o BatchMode=yes "$target" bash -s -- "$jijia_root" <<'REMOTE'
set -Eeuo pipefail
root="$1"
cd "$root"
app_id="$(docker compose -f "$root/compose.yaml" ps -q app)"
db_id="$(docker compose -f "$root/compose.yaml" ps -q db)"
app_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$app_id")"
db_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$db_id")"
app_image="$(docker inspect --format '{{.Config.Image}}' "$app_id")"
app_release="$(awk '/^  app:$/ { in_app=1; next } in_app && /^  [[:alnum:]_-]+:$/ { in_app=0 } in_app && /^    build:/ { print $2; exit }' "$root/compose.yaml")"
app_release="${app_release##*/}"
if [[ "$app_health" != healthy || "$db_health" != healthy ]]; then
  echo "Production deploy aborted: current app and database must both be healthy." >&2
  exit 1
fi
if [[ ! "$app_image" =~ ^jijia-backend:[A-Za-z0-9._-]+$ || ! "$app_release" =~ ^[0-9]{8}-[A-Za-z0-9._-]+-[0-9a-f]{7,40}$ ]]; then
  echo "Production deploy aborted: unable to identify current image and release." >&2
  exit 1
fi
docker image inspect "$app_image" >/dev/null
release_dir="$root/releases/$app_release"
if [[ ! -f "$release_dir/commit.txt" || ! -f "$release_dir/SHA256SUMS" || ! -f "$release_dir/Dockerfile" || ! -f "$release_dir/tarsgo-backend-linux-amd64" || ! -f "$release_dir/tarsgo-migrate-linux-amd64" ]]; then
  echo "Production deploy aborted: current_stable release is incomplete." >&2
  exit 1
fi
(cd "$release_dir" && sha256sum --check -- SHA256SUMS >/dev/null)
release_commit="$(cat "$release_dir/commit.txt")"
image_commit="${app_image##*-}"
if [[ ! "$release_commit" =~ ^[0-9a-f]{40}$ || ! "$image_commit" =~ ^[0-9a-f]{7,40}$ || "$release_commit" != "$image_commit"* ]]; then
  echo "Production deploy aborted: current_stable image tag and release SHA do not match." >&2
  exit 1
fi
printf '%s\n%s\n' "$app_image" "$app_release"
REMOTE
)"
previous_image="$(printf '%s\n' "$state" | sed -n '1p')"
previous_release="$(printf '%s\n' "$state" | sed -n '2p')"
release_name="$(date -u +%Y%m%d)-ops-retention-$short_sha"
image_tag="$release_name"

if [[ -z "$previous_image" || -z "$previous_release" ]]; then
  echo "Production deploy aborted: previous_stable could not be recorded." >&2
  exit 1
fi
if "$ssh_bin" -o BatchMode=yes "$target" test -e "$jijia_root/releases/$release_name"; then
  echo "Production deploy aborted: release path already exists: $release_name" >&2
  exit 1
fi
printf 'previous_stable_image=%s\nprevious_stable_release=%s\n' "$previous_image" "$previous_release"

cleanup_output="$("$ssh_bin" -o BatchMode=yes "$target" bash -s -- "$jijia_root" <"$repo_root/scripts/production-safe-cleanup.sh")"
printf '%s\n' "$cleanup_output"
safe_cleanup_performed="$(printf '%s\n' "$cleanup_output" | sed -n 's/^safe_cleanup_performed=//p' | tail -n 1)"
if [[ "$safe_cleanup_performed" != 0 && "$safe_cleanup_performed" != 1 ]]; then
  echo "Production deploy aborted: safe cleanup status could not be confirmed." >&2
  exit 1
fi

if ! "$ssh_bin" -o BatchMode=yes "$target" test -s /root/.ssh/jijia-backup-ssh-config; then
  "$repo_root/scripts/setup-production-backup-destination.sh"
fi

release_dir="$(mktemp -d "${TMPDIR:-/tmp}/tarsgo-release.XXXXXXXX")"
cleanup() {
  status=$?
  trap - EXIT
  rm -rf -- "$release_dir"
  "$make_bin" -C "$repo_root" clean >/dev/null 2>&1 || true
  if git -C "$repo_root" ls-files --error-unmatch internal/backend/web/frontend/.keep >/dev/null 2>&1; then
    mkdir -p "$repo_root/internal/backend/web/frontend"
    git -C "$repo_root" show "$commit_sha:internal/backend/web/frontend/.keep" >"$repo_root/internal/backend/web/frontend/.keep"
  fi
  exit "$status"
}
trap cleanup EXIT
"$make_bin" -C "$repo_root" build-linux-amd64

cp -- "$repo_root/dist/tarsgo-backend-linux-amd64" "$release_dir/"
cp -- "$repo_root/dist/tarsgo-migrate-linux-amd64" "$release_dir/"
cp -- "$repo_root/scripts/production.Dockerfile" "$release_dir/Dockerfile"
printf '%s\n' "$commit_sha" >"$release_dir/commit.txt"
(cd "$release_dir" && sha256sum Dockerfile commit.txt tarsgo-backend-linux-amd64 tarsgo-migrate-linux-amd64 >SHA256SUMS)

chmod 0755 "$release_dir"
chmod 0644 "$release_dir/Dockerfile" "$release_dir/SHA256SUMS" "$release_dir/commit.txt" "$release_dir/tarsgo-backend-linux-amd64" "$release_dir/tarsgo-migrate-linux-amd64"
"$rsync_bin" --archive "$release_dir/" "$target:$jijia_root/releases/$release_name/"
"$rsync_bin" --archive "$repo_root/scripts/backup-production.sh" "$repo_root/scripts/backup-production.service" "$repo_root/scripts/backup-production.timer" "$target:/tmp/"
"$ssh_bin" -o BatchMode=yes "$target" bash -s -- "$jijia_root" <<'INSTALL_BACKUP'
set -Eeuo pipefail
root="$1"
install -o root -g root -m 0700 /tmp/backup-production.sh "$root/jijia-backup.sh"
install -o root -g root -m 0644 /tmp/backup-production.service /etc/systemd/system/backup-production.service
install -o root -g root -m 0644 /tmp/backup-production.timer /etc/systemd/system/backup-production.timer
rm -f /tmp/backup-production.sh /tmp/backup-production.service /tmp/backup-production.timer
systemctl daemon-reload
systemctl enable --now backup-production.timer
INSTALL_BACKUP

if [[ "$require_offsite_backup" == 1 ]]; then
  echo "production_backup_mode=offsite (explicitly required before deployment)"
  "$ssh_bin" -o BatchMode=yes "$target" "$jijia_root/jijia-backup.sh" --offsite
else
  echo "production_backup_mode=skipped (weekly offsite backup remains enabled)"
fi
if [[ "$safe_cleanup_performed" == 0 ]]; then
  "$ssh_bin" -o BatchMode=yes "$target" bash -s -- "$jijia_root" "$release_name" <"$repo_root/scripts/production-safe-cleanup.sh"
fi
"$ssh_bin" -o BatchMode=yes "$target" bash -s -- "$jijia_root" "$release_name" "$image_tag" "$previous_image" "$previous_release" "$commit_sha" <"$repo_root/scripts/deploy-production-remote.sh"
