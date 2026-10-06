#!/usr/bin/env bash
set -Eeuo pipefail

jijia_root="${JIJIA_ROOT:-/opt/jijia}"
health_attempts="${HEALTH_ATTEMPTS:-30}"
health_interval="${HEALTH_INTERVAL:-5}"
min_free_bytes=4294967296

if [[ $# -ne 6 ]]; then
  echo "usage: deploy-production-remote.sh <jijia-root> <release> <image-tag> <previous-image> <previous-release> <commit-sha>" >&2
  exit 2
fi

jijia_root="$1"
release_name="$2"
image_tag="$3"
previous_image="$4"
previous_release="$5"
commit_sha="$6"
release_pattern='^[0-9]{8}-[A-Za-z0-9._-]+-[0-9a-f]{7,40}$'
image_pattern='^jijia-backend:[A-Za-z0-9._-]+$'

if [[ ! "$release_name" =~ $release_pattern || "$image_tag" != "$release_name" || ! "$previous_release" =~ $release_pattern || ! "$previous_image" =~ $image_pattern || ! "$commit_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Production deploy aborted: invalid release metadata." >&2
  exit 2
fi
release_commit_tag="${release_name##*-}"
if [[ "$commit_sha" != "$release_commit_tag"* ]]; then
  echo "Production deploy aborted: release name and source commit SHA do not match." >&2
  exit 2
fi

cd "$jijia_root"
compose_file="$jijia_root/compose.yaml"
release_dir="$jijia_root/releases/$release_name"
new_image="jijia-backend:$image_tag"

available_bytes="$(df -B1 --output=avail / | tail -n 1 | tr -d '[:space:]')"
if [[ ! "$available_bytes" =~ ^[0-9]+$ || "$available_bytes" -lt "$min_free_bytes" ]]; then
  available_gib="$(awk -v bytes="${available_bytes:-0}" 'BEGIN { printf "%.1f", bytes / 1073741824 }')"
  echo "Production deploy aborted: only ${available_gib} GiB available; at least 4 GiB is required." >&2
  exit 1
fi

if [[ ! -d "$release_dir" || ! -f "$release_dir/commit.txt" || "$(cat "$release_dir/commit.txt")" != "$commit_sha" ]]; then
  echo "Production deploy aborted: uploaded release is incomplete or has the wrong commit." >&2
  exit 1
fi
(cd "$release_dir" && sha256sum --check -- SHA256SUMS)

current_running_image="$(docker inspect --format '{{.Config.Image}}' "$(docker compose -f "$compose_file" ps -q app)")"
current_config_image="$(awk '/^  app:$/ { in_app=1; next } in_app && /^  [[:alnum:]_-]+:$/ { in_app=0 } in_app && /^    image:/ { print $2; exit }' "$compose_file")"
current_release_path="$(awk '/^  app:$/ { in_app=1; next } in_app && /^  [[:alnum:]_-]+:$/ { in_app=0 } in_app && /^    build:/ { print $2; exit }' "$compose_file")"
current_release="${current_release_path##*/}"

if [[ "$current_running_image" != "$previous_image" || "$current_config_image" != "$previous_image" || "$current_release" != "$previous_release" ]]; then
  echo "Production deploy aborted: live release changed after previous_stable was recorded." >&2
  exit 1
fi
previous_release_dir="$jijia_root/releases/$previous_release"
if [[ ! -f "$previous_release_dir/commit.txt" || ! -f "$previous_release_dir/SHA256SUMS" || ! -f "$previous_release_dir/Dockerfile" || ! -f "$previous_release_dir/tarsgo-backend-linux-amd64" || ! -f "$previous_release_dir/tarsgo-migrate-linux-amd64" ]]; then
  echo "Production deploy aborted: previous_stable release is incomplete." >&2
  exit 1
fi
(cd "$previous_release_dir" && sha256sum --check -- SHA256SUMS >/dev/null)
previous_commit="$(cat "$previous_release_dir/commit.txt")"
previous_image_commit="${previous_image##*-}"
if [[ ! "$previous_commit" =~ ^[0-9a-f]{40}$ || ! "$previous_image_commit" =~ ^[0-9a-f]{7,40}$ || "$previous_commit" != "$previous_image_commit"* ]]; then
  echo "Production deploy aborted: previous_stable image tag and release SHA do not match." >&2
  exit 1
fi
docker image inspect "$previous_image" >/dev/null
docker image inspect "mariadb:11.4" >/dev/null

compose_backup="$(mktemp "$jijia_root/.compose-before-deploy.XXXXXXXX")"
compose_candidate="${compose_file}.next.$$"
cp -- "$compose_file" "$compose_backup"
compose_changed=0
retention_started=0

wait_for_health() {
  local expected_image="$1"
  local attempt app_id db_id app_health db_health
  for ((attempt = 1; attempt <= health_attempts; attempt++)); do
    app_id="$(docker compose -f "$compose_file" ps -q app)"
    db_id="$(docker compose -f "$compose_file" ps -q db)"
    app_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$app_id" 2>/dev/null || true)"
    db_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$db_id" 2>/dev/null || true)"
    if [[ "$app_health" == healthy && "$db_health" == healthy && "$(docker inspect --format '{{.Config.Image}}' "$app_id")" == "$expected_image" ]] && curl --fail --silent --show-error --max-time 5 http://127.0.0.1:8081/healthz >/dev/null; then
      return 0
    fi
    sleep "$health_interval"
  done
  return 1
}

restore_previous_release() {
  cp -- "$compose_backup" "$compose_file"
  docker compose -f "$compose_file" up -d --no-deps app
  wait_for_health "$previous_image" || return 1
}

on_exit() {
  status=$?
  if [[ $status -ne 0 && $compose_changed -eq 1 && $retention_started -eq 0 ]]; then
    echo "Production health check failed; restoring previous_stable $previous_image." >&2
    restore_previous_release || echo "Rollback health check also failed; previous compose and image are preserved." >&2
  fi
  rm -f -- "$compose_backup" "$compose_candidate"
  exit "$status"
}
trap on_exit EXIT

docker build -t "$new_image" "$release_dir"
db_id="$(docker compose -f "$compose_file" ps -q db)"
network="$(docker inspect --format '{{range $key, $value := .NetworkSettings.Networks}}{{$key}}{{end}}' "$db_id")"
if [[ -z "$network" ]]; then
  echo "Production deploy aborted: unable to resolve the database Docker network." >&2
  exit 1
fi
docker run --rm --network "$network" --env-file "$jijia_root/app.env" \
  -e APP_ENV=production -e APP_AUTO_MIGRATE=false \
  --entrypoint /app/tarsgo-migrate "$new_image"

python3 - "$compose_file" "$compose_candidate" "$new_image" "$release_name" <<'PY'
import pathlib
import re
import sys

source, destination, image, release = sys.argv[1:]
text = pathlib.Path(source).read_text()
text, image_count = re.subn(r"(?m)^(    image: )jijia-backend:[^\s]+$", rf"\g<1>{image}", text)
text, release_count = re.subn(r"(?m)^(    build: \./releases/)[^\s]+$", rf"\g<1>{release}", text)
if image_count != 1 or release_count != 1:
    raise SystemExit("Production deploy aborted: compose app image/build entries are ambiguous.")
pathlib.Path(destination).write_text(text)
PY
chmod 0644 "$compose_candidate"
compose_changed=1
mv -- "$compose_candidate" "$compose_file"
docker compose -f "$compose_file" up -d --no-deps app

if ! wait_for_health "$new_image"; then
  echo "Production health check failed; no retention will run." >&2
  exit 1
fi

if [[ ! -d "$jijia_root/releases/$release_name" || ! -d "$jijia_root/releases/$previous_release" ]]; then
  echo "Production deploy aborted: current or previous release directory is missing." >&2
  exit 1
fi
docker image inspect "$new_image" >/dev/null
docker image inspect "$previous_image" >/dev/null

retention_started=1
while IFS= read -r image_tag_to_remove; do
  [[ -n "$image_tag_to_remove" && "$image_tag_to_remove" != '<none>' ]] || continue
  case "$image_tag_to_remove" in
    "$image_tag"|"${previous_image#jijia-backend:}") continue ;;
  esac
  if [[ "$image_tag_to_remove" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; then
    docker image rm "jijia-backend:$image_tag_to_remove"
  fi
done < <(docker image ls --format '{{.Tag}}' jijia-backend)

for release_path in "$jijia_root"/releases/*; do
  [[ -d "$release_path" ]] || continue
  release_candidate="${release_path##*/}"
  [[ "$release_candidate" =~ $release_pattern ]] || continue
  case "$release_candidate" in
    "$release_name"|"${previous_release}") continue ;;
  esac
  rm -rf -- "$release_path"
done
for metadata_path in "$jijia_root"/releases/._*; do
  [[ -f "$metadata_path" ]] || continue
  metadata_name="${metadata_path##*/}"
  release_candidate="${metadata_name#._}"
  [[ "$release_candidate" =~ $release_pattern ]] || continue
  case "$release_candidate" in
    "$release_name"|"${previous_release}") continue ;;
  esac
  rm -f -- "$metadata_path"
done

if [[ "$(docker inspect --format '{{.Config.Image}}' "$(docker compose -f "$compose_file" ps -q app)")" != "$new_image" ]]; then
  echo "Post-retention verification failed: current image tag changed." >&2
  exit 1
fi
docker image inspect "$new_image" >/dev/null
docker image inspect "$previous_image" >/dev/null
[[ -d "$jijia_root/releases/$release_name" && -d "$jijia_root/releases/$previous_release" ]]
wait_for_health "$new_image"

echo "Production verification after retention:"
df -h /
docker ps --format '{{.Names}} {{.Image}} {{.Status}}'
curl --fail --silent --show-error http://127.0.0.1:8081/healthz
printf '\ncurrent_image=%s\nprevious_stable_image=%s\n' "$new_image" "$previous_image"
printf 'current_release=%s\nprevious_stable_release=%s\n' "$release_name" "$previous_release"
docker image ls --format '{{.Repository}}:{{.Tag}}' jijia-backend
if [[ "$(df -B1 --output=avail / | tail -n 1 | tr -d '[:space:]')" -lt "$min_free_bytes" ]]; then
  echo "WARNING: production root filesystem has less than 4 GiB available after retention; manual disk audit is required. No further resources were deleted." >&2
fi

trap - EXIT
rm -f -- "$compose_backup" "$compose_candidate"
