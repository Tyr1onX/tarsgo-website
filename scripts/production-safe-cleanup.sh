#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "usage: production-safe-cleanup.sh <jijia-root> [pending-release]" >&2
  exit 2
fi

jijia_root="$1"
pending_release="${2:-}"
backup_dir="$jijia_root/backups"
apt_lists_dir="${APT_LISTS_DIR:-/var/lib/apt/lists}"
retention_minutes=10080
release_pattern='^[0-9]{8}-[A-Za-z0-9._-]+-[0-9a-f]{7,40}$'
if [[ -n "$pending_release" && ! "$pending_release" =~ $release_pattern ]]; then
  echo "Production deploy aborted: invalid pending release name for safe cleanup." >&2
  exit 2
fi

disk_usage_percent() {
  local value
  value="$(df -P / | awk 'END { value=$5; gsub(/%/, "", value); print value }')"
  [[ "$value" =~ ^[0-9]+$ ]] || return 1
  printf '%s\n' "$value"
}

usage="$(disk_usage_percent)" || {
  echo "Production deploy aborted: unable to read root filesystem usage." >&2
  exit 1
}
if (( usage < 85 )); then
  echo "Production disk usage is ${usage}%; safe cleanup is not needed."
  echo "safe_cleanup_performed=0"
  exit 0
fi

current_app_id="$(docker compose -f "$jijia_root/compose.yaml" ps -q app)"
current_image="$(docker inspect --format '{{.Config.Image}}' "$current_app_id")"
configured_image="$(awk '/^  app:$/ { in_app=1; next } in_app && /^  [[:alnum:]_-]+:$/ { in_app=0 } in_app && /^    image:/ { print $2; exit }' "$jijia_root/compose.yaml")"
current_release_path="$(awk '/^  app:$/ { in_app=1; next } in_app && /^  [[:alnum:]_-]+:$/ { in_app=0 } in_app && /^    build:/ { print $2; exit }' "$jijia_root/compose.yaml")"
current_release="${current_release_path##*/}"
if [[ ! "$current_image" =~ ^jijia-backend:[A-Za-z0-9._-]+$ || "$configured_image" != "$current_image" || ! "$current_release" =~ $release_pattern || "${current_image#jijia-backend:}" != "$current_release" ]]; then
  echo "Production deploy aborted: safe cleanup cannot identify the current Jijia image and release." >&2
  exit 1
fi

protected_image_tags=("${current_image#jijia-backend:}")
protected_releases=("$current_release")
retention_state="$jijia_root/.production-retention-state"
previous_image=""
previous_release=""
if [[ -f "$retention_state" && ! -L "$retention_state" ]]; then
  previous_image="$(awk -F= '$1 == "previous_image" { sub(/^[^=]*=/, ""); print; exit }' "$retention_state")"
  previous_release="$(awk -F= '$1 == "previous_release" { sub(/^[^=]*=/, ""); print; exit }' "$retention_state")"
  state_current_image="$(awk -F= '$1 == "current_image" { sub(/^[^=]*=/, ""); print; exit }' "$retention_state")"
  state_current_release="$(awk -F= '$1 == "current_release" { sub(/^[^=]*=/, ""); print; exit }' "$retention_state")"
  if [[ "$state_current_image" == "$current_image" && "$state_current_release" == "$current_release" && "$previous_image" =~ ^jijia-backend:[A-Za-z0-9._-]+$ && "$previous_release" =~ $release_pattern && "${previous_image#jijia-backend:}" == "$previous_release" && "$previous_image" != "$current_image" && -d "$jijia_root/releases/$previous_release" ]] && docker image inspect "$previous_image" >/dev/null 2>&1; then
    protected_image_tags+=("${previous_image#jijia-backend:}")
    protected_releases+=("$previous_release")
  else
    previous_image=""
    previous_release=""
  fi
fi

if [[ -z "$previous_image" ]]; then
  existing_image_tags=()
  while IFS= read -r image_ref; do
    [[ "$image_ref" == jijia-backend:* ]] || continue
    candidate="${image_ref#jijia-backend:}"
    [[ "$candidate" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] && existing_image_tags+=("$candidate")
  done < <(docker image ls --format '{{.Repository}}:{{.Tag}}' jijia-backend)
  existing_releases=()
  while IFS= read -r candidate; do
    existing_releases+=("$candidate")
  done < <(for release_path in "$jijia_root"/releases/*; do
    [[ -d "$release_path" ]] || continue
    release_candidate="${release_path##*/}"
    [[ "$release_candidate" =~ $release_pattern ]] && printf '%s\n' "$release_candidate"
  done)
  if (( ${#existing_image_tags[@]} == 2 && ${#existing_releases[@]} == 2 )) && [[ " ${existing_image_tags[*]} " == *" ${protected_image_tags[0]} "* && " ${existing_releases[*]} " == *" ${protected_releases[0]} "* ]]; then
    for candidate in "${existing_image_tags[@]}"; do
      [[ "$candidate" == "${protected_image_tags[0]}" ]] || previous_image="jijia-backend:$candidate"
    done
    for candidate in "${existing_releases[@]}"; do
      [[ "$candidate" == "${protected_releases[0]}" ]] || previous_release="$candidate"
    done
    if [[ -n "$previous_image" && "${previous_image#jijia-backend:}" == "$previous_release" ]] && docker image inspect "$previous_image" >/dev/null 2>&1; then
      protected_image_tags+=("${previous_image#jijia-backend:}")
      protected_releases+=("$previous_release")
    else
      previous_image=""
      previous_release=""
    fi
  fi
fi

docker builder prune --force
if command -v apt-get >/dev/null 2>&1 && command -v pgrep >/dev/null 2>&1 &&
  ! pgrep -x apt-get >/dev/null 2>&1 && ! pgrep -x apt >/dev/null 2>&1 &&
  ! pgrep -x dpkg >/dev/null 2>&1 && ! pgrep -x unattended-upgrade >/dev/null 2>&1; then
  apt-get clean
  if [[ -d "$apt_lists_dir" ]]; then
    find "$apt_lists_dir" -mindepth 1 -maxdepth 1 ! -name lock ! -name partial -exec rm -rf -- {} +
  fi
else
  echo "Skipping APT cache cleanup while package management is active or cannot be checked."
fi

if [[ -d "$backup_dir" ]]; then
  for pattern in 'jijia-full-*.tar.gz' 'jijia-*.sql.gz' 'uploads-*.tar.gz' 'compose-before-*.yaml'; do
    while IFS= read -r -d '' expired_archive; do
      rm -f -- "$expired_archive" "$expired_archive.sha256"
    done < <(find "$backup_dir" -maxdepth 1 -type f -name "$pattern" -mmin "+$retention_minutes" -print0)
  done
fi

if [[ -n "$previous_image" && -n "$previous_release" ]]; then
  while IFS= read -r image_ref; do
    [[ "$image_ref" == jijia-backend:* ]] || continue
    image_tag="${image_ref#jijia-backend:}"
    [[ "$image_tag" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || continue
    case "$image_tag" in
      "${protected_image_tags[0]}"|"${protected_image_tags[1]}"|"$pending_release") continue ;;
    esac
    docker image rm "$image_ref"
  done < <(docker image ls --format '{{.Repository}}:{{.Tag}}' jijia-backend)

  for release_path in "$jijia_root"/releases/*; do
    [[ -d "$release_path" ]] || continue
    release_candidate="${release_path##*/}"
    [[ "$release_candidate" =~ $release_pattern ]] || continue
    case "$release_candidate" in
      "${protected_releases[0]}"|"${protected_releases[1]}"|"$pending_release") continue ;;
    esac
    rm -rf -- "$release_path"
    rm -f -- "$jijia_root/releases/._$release_candidate"
  done
else
  echo "Skipping historical Jijia image/release cleanup: previous_stable could not be identified safely." >&2
fi

usage="$(disk_usage_percent)" || {
  echo "Production deploy aborted: unable to read root filesystem usage after safe cleanup." >&2
  exit 1
}
if (( usage >= 85 )); then
  echo "Production deploy aborted: root filesystem remains at ${usage}% after safe cleanup; deployment requires usage below 85%." >&2
  exit 1
fi
echo "Production safe cleanup completed; root filesystem usage is ${usage}%."
echo "safe_cleanup_performed=1"
