#!/usr/bin/env bash
set -Eeuo pipefail

jijia_root="${JIJIA_ROOT:-/opt/jijia}"
health_attempts="${HEALTH_ATTEMPTS:-30}"
health_interval="${HEALTH_INTERVAL:-5}"

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

disk_usage_percent="$(df -P / | awk 'END { value=$5; gsub(/%/, "", value); print value }')"
if [[ ! "$disk_usage_percent" =~ ^[0-9]+$ || "$disk_usage_percent" -ge 85 ]]; then
  echo "Production deploy aborted: root filesystem usage is ${disk_usage_percent:-unknown}% before Docker build; usage must remain below 85%." >&2
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

# Only traverse parents recorded from an explicitly retired jijia-backend tag.
# Never prune all dangling images: the host also runs TARS Base and other services.
reclaim_retired_jijia_parents() {
  local parent="$1" next_parent tags container_refs
  local removed=0
  while [[ "$parent" =~ ^sha256:[0-9a-f]{64}$ ]]; do
    if ! tags="$(docker image inspect --format '{{json .RepoTags}}' "$parent" 2>/dev/null)"; then
      break
    fi
    # Tagged parents (including shared base images) must never be removed.
    [[ "$tags" == '[]' ]] || break
    # Running *and stopped* containers protect their image ancestry.
    if ! container_refs="$(docker ps -aq --filter "ancestor=$parent")"; then
      echo "WARNING: cannot verify image consumers for $parent; preserving the remaining chain." >&2
      break
    fi
    if [[ -n "$container_refs" ]]; then
      break
    fi
    if ! next_parent="$(docker image inspect --format '{{.Parent}}' "$parent" 2>/dev/null)"; then
      break
    fi
    # Docker enforces remaining child-image references, including rollback images
    # without a running container. Failure is a safe stop, not a deployment failure.
    if ! docker image rm "$parent" >/dev/null 2>&1; then
      echo "Preserving still-referenced Jijia build parent $parent." >&2
      break
    fi
    ((removed += 1))
    parent="$next_parent"
  done
  echo "Retired Jijia build parents removed: $removed"
}

retention_available_before="$(df -B1 / | awk 'END { print $4 }')"
retention_started=1
while IFS= read -r image_tag_to_remove; do
  [[ -n "$image_tag_to_remove" && "$image_tag_to_remove" != '<none>' ]] || continue
  case "$image_tag_to_remove" in
    "$image_tag"|"${previous_image#jijia-backend:}") continue ;;
  esac
  if [[ "$image_tag_to_remove" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; then
    retired_image="jijia-backend:$image_tag_to_remove"
    # Read lineage before removing the named image, as Docker may lose the tag.
    retired_parent="$(docker image inspect --format '{{.Parent}}' "$retired_image" 2>/dev/null || true)"
    docker image rm "$retired_image"
    reclaim_retired_jijia_parents "$retired_parent"
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

retention_state_tmp="$jijia_root/.production-retention-state.$$"
if printf 'current_image=%s\ncurrent_release=%s\nprevious_image=%s\nprevious_release=%s\n' \
  "$new_image" "$release_name" "$previous_image" "$previous_release" >"$retention_state_tmp" &&
  chmod 0600 "$retention_state_tmp" && mv -- "$retention_state_tmp" "$jijia_root/.production-retention-state"; then
  :
else
  rm -f -- "$retention_state_tmp"
  echo "WARNING: current/previous retention state could not be recorded; future safe cleanup will preserve ambiguous Jijia history." >&2
fi

retention_available_after="$(df -B1 / | awk 'END { print $4 }')"
if [[ "$retention_available_before" =~ ^[0-9]+$ && "$retention_available_after" =~ ^[0-9]+$ ]]; then
  printf 'retention_free_bytes_before=%s\nretention_free_bytes_after=%s\nretention_free_bytes_delta=%s\n' \
    "$retention_available_before" "$retention_available_after" "$((retention_available_after - retention_available_before))"
fi

echo "Production verification after retention:"
df -h /
docker ps --format '{{.Names}} {{.Image}} {{.Status}}'
curl --fail --silent --show-error http://127.0.0.1:8081/healthz
printf '\ncurrent_image=%s\nprevious_stable_image=%s\n' "$new_image" "$previous_image"
printf 'current_release=%s\nprevious_stable_release=%s\n' "$release_name" "$previous_release"
docker image ls --format '{{.Repository}}:{{.Tag}}' jijia-backend
disk_usage_percent="$(df -P / | awk 'END { value=$5; gsub(/%/, "", value); print value }')"
if [[ "$disk_usage_percent" =~ ^[0-9]+$ && "$disk_usage_percent" -ge 85 ]]; then
  echo "WARNING: production root filesystem usage remains at ${disk_usage_percent}% after retention. No further resources were deleted." >&2
fi

trap - EXIT
rm -f -- "$compose_backup" "$compose_candidate"
