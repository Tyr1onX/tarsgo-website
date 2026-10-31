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
if [[ "$jijia_root" != /* || "$jijia_root" == / ]]; then
  echo "Production deploy aborted: JIJIA_ROOT must be an absolute non-root path." >&2
  exit 2
fi

require_command() {
  local command_name="$1"
  local purpose="$2"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Production deploy aborted: required local tool '$command_name' is unavailable ($purpose)." >&2
    exit 127
  fi
}

require_command git "Git checkout validation"
require_command "$ssh_bin" "non-interactive production access"
ssh_options=(-o BatchMode=yes -o ConnectTimeout=15)
ssh_run() {
  "$ssh_bin" "${ssh_options[@]}" "$target" "$@"
}

if ! git -C "$repo_root" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Production deploy aborted: repository checkout is not a Git working tree." >&2
  exit 1
fi
if [[ -n "$(git -C "$repo_root" status --porcelain)" ]]; then
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

if ! GIT_TERMINAL_PROMPT=0 git -C "$repo_root" -c core.sshCommand='ssh -o BatchMode=yes -o ConnectTimeout=15' fetch origin main >/dev/null; then
  echo "Production deploy aborted: unable to fetch the latest origin/main commit." >&2
  exit 1
fi
commit_sha="$(git -C "$repo_root" rev-parse HEAD)"
main_sha="$(git -C "$repo_root" rev-parse origin/main)"
if [[ "$commit_sha" != "$main_sha" || ! "$commit_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Production deploy aborted: checkout must match the latest origin/main commit." >&2
  exit 1
fi
short_sha="${commit_sha:0:7}"
release_name="$(date -u +%Y%m%d)-ops-retention-$short_sha"

if ! ssh_run true; then
  echo "Production deploy aborted: non-interactive SSH to '$target' failed. Check the SSH alias, host key, and key access." >&2
  exit 1
fi

remote_state="$(ssh_run bash -s -- "$jijia_root" "$release_name" "$commit_sha" <<'REMOTE_PREFLIGHT'
set -Eeuo pipefail
root="$1"
requested_release="$2"
requested_commit="$3"
release_pattern='^[0-9]{8}-[A-Za-z0-9._-]+-[0-9a-f]{7,40}$'
if [[ ! "$requested_release" =~ $release_pattern || ! "$requested_commit" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Production deploy aborted: invalid requested release metadata." >&2
  exit 2
fi

for tool in docker sha256sum curl df awk; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Production deploy aborted: required production tool '$tool' is unavailable." >&2
    exit 1
  fi
done
if ! docker compose version >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  echo "Production deploy aborted: Docker Compose or the Docker daemon is unavailable." >&2
  exit 1
fi

compose_file="$root/compose.yaml"
if [[ ! -f "$compose_file" ]]; then
  echo "Production deploy aborted: production compose.yaml is missing." >&2
  exit 1
fi
app_id="$(docker compose -f "$compose_file" ps -q app)"
db_id="$(docker compose -f "$compose_file" ps -q db)"
if [[ -z "$app_id" || -z "$db_id" ]]; then
  echo "Production deploy aborted: current app and database containers must both be running." >&2
  exit 1
fi
app_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$app_id")"
db_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$db_id")"
if [[ "$app_health" != healthy || "$db_health" != healthy ]]; then
  echo "Production deploy aborted: current app and database must both be healthy." >&2
  exit 1
fi
health_status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' --max-time 5 http://127.0.0.1:8081/healthz)"
if [[ "$health_status" != 200 ]]; then
  echo "Production deploy aborted: current application /healthz returned HTTP ${health_status:-unknown}." >&2
  exit 1
fi

app_image="$(docker inspect --format '{{.Config.Image}}' "$app_id")"
app_release_path="$(awk '/^  app:$/ { in_app=1; next } in_app && /^  [[:alnum:]_-]+:$/ { in_app=0 } in_app && /^    build:/ { print $2; exit }' "$compose_file")"
app_release="${app_release_path##*/}"
if [[ ! "$app_image" =~ ^jijia-backend:[A-Za-z0-9._-]+$ || ! "$app_release" =~ $release_pattern || "$app_image" != "jijia-backend:$app_release" ]]; then
  echo "Production deploy aborted: unable to identify the current production image and release." >&2
  exit 1
fi
current_release_dir="$root/releases/$app_release"
if [[ ! -f "$current_release_dir/commit.txt" || ! -f "$current_release_dir/SHA256SUMS" || ! -f "$current_release_dir/Dockerfile" || ! -f "$current_release_dir/tarsgo-backend-linux-amd64" || ! -f "$current_release_dir/tarsgo-migrate-linux-amd64" ]]; then
  echo "Production deploy aborted: current_stable release is incomplete." >&2
  exit 1
fi
(cd "$current_release_dir" && sha256sum --check -- SHA256SUMS >/dev/null)
current_commit="$(cat "$current_release_dir/commit.txt")"
image_commit="${app_image##*-}"
if [[ ! "$current_commit" =~ ^[0-9a-f]{40}$ || ! "$image_commit" =~ ^[0-9a-f]{7,40}$ || "$current_commit" != "$image_commit"* ]]; then
  echo "Production deploy aborted: current_stable image tag and release SHA do not match." >&2
  exit 1
fi

disk_usage_percent="$(df -P / | awk 'END { value=$5; gsub(/%/, "", value); print value }')"
if [[ ! "$disk_usage_percent" =~ ^[0-9]+$ ]]; then
  echo "Production deploy aborted: unable to read root filesystem usage." >&2
  exit 1
fi

target_release_dir="$root/releases/$requested_release"
target_release_status=missing
if [[ -e "$target_release_dir" || -L "$target_release_dir" ]]; then
  if [[ -d "$target_release_dir" && -f "$target_release_dir/commit.txt" && -f "$target_release_dir/SHA256SUMS" && -f "$target_release_dir/Dockerfile" && -f "$target_release_dir/tarsgo-backend-linux-amd64" && -f "$target_release_dir/tarsgo-migrate-linux-amd64" ]] &&
    [[ "$(cat "$target_release_dir/commit.txt")" == "$requested_commit" ]] &&
    (cd "$target_release_dir" && sha256sum --check -- SHA256SUMS >/dev/null 2>&1); then
    target_release_status=complete
  else
    target_release_status=incomplete
  fi
fi

if [[ "$current_commit" != "$requested_commit" ]]; then
  for tool in rsync python3 systemctl install chmod rm mv find; do
    if ! command -v "$tool" >/dev/null 2>&1; then
      echo "Production deploy aborted: required production tool '$tool' is unavailable." >&2
      exit 1
    fi
  done
fi

printf 'current_image=%s\ncurrent_release=%s\ncurrent_commit=%s\ndisk_usage_percent=%s\ntarget_release_status=%s\n' \
  "$app_image" "$app_release" "$current_commit" "$disk_usage_percent" "$target_release_status"
REMOTE_PREFLIGHT
)"

state_value() {
  local key="$1"
  printf '%s\n' "$remote_state" | sed -n "s/^$key=//p" | tail -n 1
}
previous_image="$(state_value current_image)"
previous_release="$(state_value current_release)"
current_commit="$(state_value current_commit)"
disk_usage_percent="$(state_value disk_usage_percent)"
target_release_status="$(state_value target_release_status)"
if [[ -z "$previous_image" || -z "$previous_release" || ! "$current_commit" =~ ^[0-9a-f]{40}$ || ! "$disk_usage_percent" =~ ^[0-9]+$ ]]; then
  echo "Production deploy aborted: remote preflight state could not be confirmed." >&2
  exit 1
fi
case "$target_release_status" in
  missing|incomplete|complete) ;;
  *) echo "Production deploy aborted: remote release state is invalid." >&2; exit 1 ;;
esac
if [[ "$current_commit" == "$commit_sha" ]]; then
  printf 'Production deployment already healthy: commit=%s image=%s release=%s\n' "$commit_sha" "$previous_image" "$previous_release"
  exit 0
fi

require_command "$rsync_bin" "release and backup service file transfer"
rsync_ssh="$ssh_bin -o BatchMode=yes -o ConnectTimeout=15"
safe_cleanup_performed=""
run_safe_cleanup() {
  local cleanup_output
  cleanup_output="$(ssh_run bash -s -- "$jijia_root" "$release_name" <"$repo_root/scripts/production-safe-cleanup.sh")"
  printf '%s\n' "$cleanup_output"
  safe_cleanup_performed="$(printf '%s\n' "$cleanup_output" | sed -n 's/^safe_cleanup_performed=//p' | tail -n 1)"
  if [[ "$safe_cleanup_performed" != 0 && "$safe_cleanup_performed" != 1 ]]; then
    echo "Production deploy aborted: safe cleanup status could not be confirmed." >&2
    exit 1
  fi
}

if [[ "$target_release_status" != complete ]]; then
  require_command "$make_bin" "release build"
  require_command go "Linux backend release build"
  require_command sha256sum "release package integrity checks"
  require_command mktemp "temporary release packaging"
  if ! "$make_bin" -C "$repo_root" frontend-toolchain; then
    echo "Production deploy aborted: local Node.js/Corepack/pnpm toolchain is unavailable or unsupported." >&2
    exit 1
  fi
fi
if (( disk_usage_percent >= 85 )); then
  run_safe_cleanup
fi

release_dir=""
build_started=0
cleanup() {
  local deploy_status=$?
  local cleanup_status=0
  trap - EXIT
  if [[ -n "$release_dir" ]] && ! rm -rf -- "$release_dir"; then
    echo "Production deploy cleanup failed: local temporary release directory remains at $release_dir." >&2
    cleanup_status=1
  fi
  if (( build_started == 1 )); then
    if ! "$make_bin" -C "$repo_root" clean >/dev/null; then
      echo "Production deploy cleanup failed: make clean did not complete." >&2
      cleanup_status=1
    fi
    if git -C "$repo_root" ls-files --error-unmatch internal/backend/web/frontend/.keep >/dev/null 2>&1; then
      if ! mkdir -p "$repo_root/internal/backend/web/frontend" || ! git -C "$repo_root" show "$commit_sha:internal/backend/web/frontend/.keep" >"$repo_root/internal/backend/web/frontend/.keep"; then
        echo "Production deploy cleanup failed: the tracked frontend embed placeholder could not be restored." >&2
        cleanup_status=1
      fi
    fi
  fi
  if (( deploy_status == 0 && cleanup_status != 0 )); then
    deploy_status=1
  fi
  exit "$deploy_status"
}

if [[ "$target_release_status" != complete ]]; then
  release_dir="$(mktemp -d "${TMPDIR:-/tmp}/tarsgo-release.XXXXXXXX")"
  trap cleanup EXIT
  build_started=1
  "$make_bin" -C "$repo_root" build-linux-amd64
  for artifact in tarsgo-backend-linux-amd64 tarsgo-migrate-linux-amd64; do
    if [[ ! -s "$repo_root/dist/$artifact" ]]; then
      echo "Production deploy aborted: release build did not produce $artifact." >&2
      exit 1
    fi
    cp -- "$repo_root/dist/$artifact" "$release_dir/"
  done
  cp -- "$repo_root/scripts/production.Dockerfile" "$release_dir/Dockerfile"
  printf '%s\n' "$commit_sha" >"$release_dir/commit.txt"
  (cd "$release_dir" && sha256sum Dockerfile commit.txt tarsgo-backend-linux-amd64 tarsgo-migrate-linux-amd64 >SHA256SUMS && sha256sum --check -- SHA256SUMS)
  chmod 0755 "$release_dir"
  chmod 0644 "$release_dir/Dockerfile" "$release_dir/SHA256SUMS" "$release_dir/commit.txt" "$release_dir/tarsgo-backend-linux-amd64" "$release_dir/tarsgo-migrate-linux-amd64"
fi

printf 'previous_stable_image=%s\nprevious_stable_release=%s\n' "$previous_image" "$previous_release"
if [[ -z "$safe_cleanup_performed" ]]; then
  run_safe_cleanup
fi

if [[ "$require_offsite_backup" == 1 ]]; then
  backup_destination_state="$(ssh_run bash -s <<'BACKUP_DESTINATION_STATE'
set -Eeuo pipefail
if [[ -s /root/.ssh/jijia-backup-ssh-config ]]; then
  printf configured
else
  printf missing
fi
BACKUP_DESTINATION_STATE
)"
  case "$backup_destination_state" in
    configured) ;;
    missing) "$repo_root/scripts/setup-production-backup-destination.sh" ;;
    *) echo "Production deploy aborted: backup destination state could not be confirmed." >&2; exit 1 ;;
  esac
fi

if [[ -n "$release_dir" ]]; then
  ssh_run bash -s -- "$jijia_root" "$release_name" <<'PREPARE_RELEASE_UPLOAD'
set -Eeuo pipefail
root="$1"
release_name="$2"
release_pattern='^[0-9]{8}-[A-Za-z0-9._-]+-[0-9a-f]{7,40}$'
if [[ ! "$release_name" =~ $release_pattern ]]; then
  echo "Production deploy aborted: invalid release directory name." >&2
  exit 2
fi
compose_file="$root/compose.yaml"
release_dir="$root/releases/$release_name"
staging_dir="$root/releases/.incoming-$release_name"
current_release_path="$(awk '/^  app:$/ { in_app=1; next } in_app && /^  [[:alnum:]_-]+:$/ { in_app=0 } in_app && /^    build:/ { print $2; exit }' "$compose_file")"
current_release="${current_release_path##*/}"
previous_release=""
retention_state="$root/.production-retention-state"
if [[ -f "$retention_state" && ! -L "$retention_state" ]]; then
  previous_release="$(awk -F= '$1 == "previous_release" { sub(/^[^=]*=/, ""); print; exit }' "$retention_state")"
fi
if [[ "$release_name" == "$current_release" || "$release_name" == "$previous_release" ]]; then
  echo "Production deploy aborted: incomplete target release is still protected by the current/previous production state." >&2
  exit 1
fi
if [[ -e "$release_dir" || -L "$release_dir" ]]; then
  rm -rf -- "$release_dir"
fi
if [[ -e "$staging_dir" || -L "$staging_dir" ]]; then
  rm -rf -- "$staging_dir"
fi
install -d -m 0755 -- "$staging_dir"
PREPARE_RELEASE_UPLOAD
  "$rsync_bin" --archive --rsh="$rsync_ssh" "$release_dir/" "$target:$jijia_root/releases/.incoming-$release_name/"
  ssh_run bash -s -- "$jijia_root" "$release_name" "$commit_sha" <<'FINALIZE_RELEASE_UPLOAD'
set -Eeuo pipefail
root="$1"
release_name="$2"
commit_sha="$3"
release_pattern='^[0-9]{8}-[A-Za-z0-9._-]+-[0-9a-f]{7,40}$'
if [[ ! "$release_name" =~ $release_pattern || ! "$commit_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Production deploy aborted: invalid uploaded release metadata." >&2
  exit 2
fi
staging_dir="$root/releases/.incoming-$release_name"
release_dir="$root/releases/$release_name"
verify_release() {
  local path="$1"
  [[ -d "$path" && -f "$path/commit.txt" && -f "$path/SHA256SUMS" && -f "$path/Dockerfile" && -f "$path/tarsgo-backend-linux-amd64" && -f "$path/tarsgo-migrate-linux-amd64" ]] &&
    [[ "$(cat "$path/commit.txt")" == "$commit_sha" ]] &&
    (cd "$path" && sha256sum --check -- SHA256SUMS >/dev/null)
}
if ! verify_release "$staging_dir"; then
  echo "Production deploy aborted: uploaded temporary release is incomplete or failed SHA256 verification." >&2
  exit 1
fi
if [[ -e "$release_dir" || -L "$release_dir" ]]; then
  if verify_release "$release_dir"; then
    rm -rf -- "$staging_dir"
    echo "Production release already complete and verified: $release_name"
    exit 0
  fi
  current_release_path="$(awk '/^  app:$/ { in_app=1; next } in_app && /^  [[:alnum:]_-]+:$/ { in_app=0 } in_app && /^    build:/ { print $2; exit }' "$root/compose.yaml")"
  current_release="${current_release_path##*/}"
  previous_release=""
  retention_state="$root/.production-retention-state"
  if [[ -f "$retention_state" && ! -L "$retention_state" ]]; then
    previous_release="$(awk -F= '$1 == "previous_release" { sub(/^[^=]*=/, ""); print; exit }' "$retention_state")"
  fi
  if [[ "$release_name" == "$current_release" || "$release_name" == "$previous_release" ]]; then
    echo "Production deploy aborted: invalid target release is still protected by the current/previous production state." >&2
    exit 1
  fi
  rm -rf -- "$release_dir"
fi
mv -- "$staging_dir" "$release_dir"
verify_release "$release_dir"
echo "Production release uploaded and verified: $release_name"
FINALIZE_RELEASE_UPLOAD
fi

"$rsync_bin" --archive --rsh="$rsync_ssh" \
  "$repo_root/scripts/backup-production.sh" "$repo_root/scripts/backup-production.service" "$repo_root/scripts/backup-production.timer" \
  "$target:/tmp/"
ssh_run bash -s -- "$jijia_root" <<'INSTALL_BACKUP'
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
  ssh_run "$jijia_root/jijia-backup.sh" --offsite
else
  echo "production_backup_mode=skipped (weekly offsite backup remains enabled)"
fi

if [[ "$safe_cleanup_performed" == 0 ]]; then
  run_safe_cleanup
fi

ssh_run bash -s -- "$jijia_root" "$release_name" "$release_name" "$previous_image" "$previous_release" "$commit_sha" <"$repo_root/scripts/deploy-production-remote.sh"
