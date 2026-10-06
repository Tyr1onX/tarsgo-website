#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf -- "$tmp"' EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

test_guard_precedes_build() {
  local case_dir="$tmp/guard"
  mkdir -p "$case_dir/repo/scripts" "$case_dir/bin"
  cp "$repo_root/scripts/deploy-production.sh" "$case_dir/repo/scripts/"
  git init -q --bare "$case_dir/origin.git"
  git -C "$case_dir/repo" init -q -b main
  git -C "$case_dir/repo" config user.name OpsTest
  git -C "$case_dir/repo" config user.email ops-test@example.invalid
  git -C "$case_dir/repo" add scripts/deploy-production.sh
  git -C "$case_dir/repo" commit -qm fixture
  git -C "$case_dir/repo" remote add origin "$case_dir/origin.git"
  git -C "$case_dir/repo" push -q -u origin main
  cat >"$case_dir/bin/ssh" <<'SSH'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$*" >>"$MOCK_SSH_LOG"
printf '4000000000\n'
SSH
  cat >"$case_dir/bin/make" <<'MAKE'
#!/usr/bin/env bash
set -Eeuo pipefail
touch "$MOCK_BUILD_MARKER"
MAKE
  chmod +x "$case_dir/bin/ssh" "$case_dir/bin/make"
  local output status
  set +e
  output="$(PATH="$case_dir/bin:$PATH" MOCK_SSH_LOG="$case_dir/ssh.log" MOCK_BUILD_MARKER="$case_dir/build-ran" SSH_BIN=ssh MAKE_BIN=make "$case_dir/repo/scripts/deploy-production.sh" 2>&1)"
  status=$?
  set -e
  [[ "$status" -ne 0 ]] || fail "low-space deploy guard unexpectedly succeeded"
  [[ "$output" == *"only 3.7 GiB available; at least 4 GiB is required"* ]] || fail "low-space deploy message was unclear: $output"
  [[ ! -e "$case_dir/build-ran" ]] || fail "build ran before the disk guard"
  [[ "$(wc -l <"$case_dir/ssh.log")" -eq 1 ]] || fail "deploy performed a remote state operation after the disk guard"
  pass "less-than-4-GiB guard stops before build or production mutation"
}

make_remote_mock_bin() {
  mkdir -p "$1"
  cat >"$1/docker" <<'DOCKER'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$*" >>"$MOCK_DOCKER_LOG"
command="$1"
shift
case "$command" in
  compose)
    if [[ "$*" == *" ps -q app" ]]; then echo app; exit 0; fi
    if [[ "$*" == *" ps -q db" ]]; then echo db; exit 0; fi
    if [[ "$*" == *" up -d --no-deps app" ]]; then
      awk '/^  app:$/ { in_app=1; next } in_app && /^  [[:alnum:]_-]+:$/ { in_app=0 } in_app && /^    image:/ { print $2; exit }' "$MOCK_COMPOSE" >"$MOCK_RUNNING_IMAGE"
      exit 0
    fi
    ;;
  inspect)
    format="$2"
    object="$3"
    if [[ "$format" == *".Config.Image"* ]]; then
      if [[ "$object" == app ]]; then cat "$MOCK_RUNNING_IMAGE"; exit 0; fi
      if [[ "$object" == db ]]; then echo mariadb:11.4; exit 0; fi
      grep -Fxq -- "$object" "$MOCK_IMAGE_NAMES" && exit 0
      exit 1
    fi
    if [[ "$format" == *".State.Health"* ]]; then
      if [[ "$object" == db ]]; then echo healthy; exit 0; fi
      running="$(cat "$MOCK_RUNNING_IMAGE")"
      if [[ "$MOCK_FAIL_HEALTH" == 1 && "$running" == "$MOCK_NEW_IMAGE" ]]; then echo unhealthy; else echo healthy; fi
      exit 0
    fi
    if [[ "$format" == *".NetworkSettings.Networks"* ]]; then echo jijia_default; exit 0; fi
    ;;
  image)
    subcommand="$1"
    shift
    case "$subcommand" in
      inspect)
        grep -Fxq -- "$1" "$MOCK_IMAGE_NAMES" && exit 0
        [[ "$1" == mariadb:11.4 ]] && exit 0
        exit 1
        ;;
      ls)
        while IFS= read -r name; do
          case "$name" in jijia-backend:*) printf '%s\n' "$name" | sed 's#^jijia-backend:##' ;; esac
        done <"$MOCK_IMAGE_NAMES"
        exit 0
        ;;
      rm)
        object="$1"
        printf '%s\n' "$object" >>"$MOCK_REMOVED_IMAGES"
        sed "\|^$object\$|d" "$MOCK_IMAGE_NAMES" >"$MOCK_IMAGE_NAMES.tmp"
        mv "$MOCK_IMAGE_NAMES.tmp" "$MOCK_IMAGE_NAMES"
        exit 0
        ;;
    esac
    ;;
  build)
    while (($#)); do
      if [[ "$1" == -t ]]; then printf '%s\n' "$2" >>"$MOCK_IMAGE_NAMES"; break; fi
      shift
    done
    exit 0
    ;;
  run) exit 0 ;;
  ps) echo "jijia-app mock healthy"; exit 0 ;;
esac
echo "unexpected mocked docker command: $command $*" >&2
exit 90
DOCKER
  cat >"$1/curl" <<'CURL'
#!/usr/bin/env bash
set -Eeuo pipefail
running="$(cat "$MOCK_RUNNING_IMAGE")"
[[ "$MOCK_FAIL_HEALTH" != 1 || "$running" != "$MOCK_NEW_IMAGE" ]] || exit 22
echo healthy
CURL
  cat >"$1/df" <<'DF'
#!/usr/bin/env bash
set -Eeuo pipefail
if [[ "$*" == *"-B1"* ]]; then printf 'Avail\n5368709120\n'; else printf 'Filesystem Size Used Avail Use%% Mounted on\n/dev/mock 20G 10G 5G 50%% /\n'; fi
DF
  cat >"$1/sleep" <<'SLEEP'
#!/usr/bin/env bash
exit 0
SLEEP
  chmod +x "$1/docker" "$1/curl" "$1/df" "$1/sleep"
}

init_remote_fixture() {
  local case_dir="$1" release="$2" previous="$3" commit="$4"
  mkdir -p "$case_dir/bin" "$case_dir/jijia/releases/$previous" "$case_dir/jijia/releases/20260901-old-release-7654321" "$case_dir/jijia/releases/$release"
  make_remote_mock_bin "$case_dir/bin"
  cat >"$case_dir/jijia/compose.yaml" <<COMPOSE
services:
  app:
    image: jijia-backend:$previous
    build: ./releases/$previous
  db:
    image: mariadb:11.4
COMPOSE
  printf 'jijia-backend:%s\n' "$previous" >"$case_dir/running-image"
  printf 'jijia-backend:%s\njijia-backend:20260815-stale-tag-1234567\n' "$previous" >"$case_dir/image-names"
  printf 'abcdef0123456789012345678901234567890123\n' >"$case_dir/jijia/releases/$previous/commit.txt"
  printf 'previous dockerfile\n' >"$case_dir/jijia/releases/$previous/Dockerfile"
  printf 'previous backend\n' >"$case_dir/jijia/releases/$previous/tarsgo-backend-linux-amd64"
  printf 'previous migration\n' >"$case_dir/jijia/releases/$previous/tarsgo-migrate-linux-amd64"
  (cd "$case_dir/jijia/releases/$previous" && sha256sum Dockerfile commit.txt tarsgo-backend-linux-amd64 tarsgo-migrate-linux-amd64 >SHA256SUMS)
  printf '%s\n' "$commit" >"$case_dir/jijia/releases/$release/commit.txt"
  printf 'mock dockerfile\n' >"$case_dir/jijia/releases/$release/Dockerfile"
  printf 'backend\n' >"$case_dir/jijia/releases/$release/tarsgo-backend-linux-amd64"
  printf 'migrate\n' >"$case_dir/jijia/releases/$release/tarsgo-migrate-linux-amd64"
  (cd "$case_dir/jijia/releases/$release" && sha256sum Dockerfile commit.txt tarsgo-backend-linux-amd64 tarsgo-migrate-linux-amd64 >SHA256SUMS)
  : >"$case_dir/docker.log"
  : >"$case_dir/removed-images"
}

run_remote_deploy() {
  local case_dir="$1" release="$2" tag="$3" previous="$4" commit="$5" fail_health="$6"
  MOCK_DOCKER_LOG="$case_dir/docker.log" MOCK_COMPOSE="$case_dir/jijia/compose.yaml" \
  MOCK_RUNNING_IMAGE="$case_dir/running-image" MOCK_IMAGE_NAMES="$case_dir/image-names" \
  MOCK_REMOVED_IMAGES="$case_dir/removed-images" MOCK_NEW_IMAGE="jijia-backend:$tag" \
  MOCK_FAIL_HEALTH="$fail_health" PATH="$case_dir/bin:$PATH" JIJIA_ROOT="$case_dir/jijia" \
  HEALTH_ATTEMPTS=2 HEALTH_INTERVAL=0 bash "$repo_root/scripts/deploy-production-remote.sh" \
    "$release" "$tag" "jijia-backend:$previous" "$previous" "$commit"
}

test_retention_keeps_two_releases() {
  local case_dir="$tmp/retention" release=20261006-ops-retention-abcdef1 previous=20260930-admin-design-system-abcdef0 commit=abcdef1123456789012345678901234567890123 expected actual
  init_remote_fixture "$case_dir" "$release" "$previous" "$commit"
  run_remote_deploy "$case_dir" "$release" "$release" "$previous" "$commit" 0 >/dev/null
  expected="$(printf '%s\n%s\n' "$release" "$previous" | sort | tr '\n' ' ')"
  actual="$(sed 's#^jijia-backend:##' "$case_dir/image-names" | sort | tr '\n' ' ')"
  [[ "$actual" == "$expected" ]] || fail "retention left unexpected jijia-backend tags: $actual"
  [[ -d "$case_dir/jijia/releases/$release" && -d "$case_dir/jijia/releases/$previous" ]] || fail "current/previous releases missing after retention"
  [[ ! -e "$case_dir/jijia/releases/20260901-old-release-7654321" ]] || fail "old release directory survived retention"
  pass "successful deployment retention keeps current and previous image/release"
}

test_health_failure_skips_retention() {
  local case_dir="$tmp/health-failure" release=20261006-ops-retention-abcdef2 previous=20260930-admin-design-system-abcdef0 commit=abcdef2123456789012345678901234567890123 status
  init_remote_fixture "$case_dir" "$release" "$previous" "$commit"
  set +e
  run_remote_deploy "$case_dir" "$release" "$release" "$previous" "$commit" 1 >/dev/null 2>&1
  status=$?
  set -e
  [[ "$status" -ne 0 ]] || fail "unhealthy deployment unexpectedly succeeded"
  [[ "$(cat "$case_dir/running-image")" == "jijia-backend:$previous" ]] || fail "previous image was not restored"
  grep -Fxq 'jijia-backend:20260815-stale-tag-1234567' "$case_dir/image-names" || fail "health failure deleted an old image"
  [[ -d "$case_dir/jijia/releases/20260901-old-release-7654321" ]] || fail "health failure deleted an old release"
  [[ ! -s "$case_dir/removed-images" ]] || fail "health failure invoked image retention"
  pass "health failure restores previous app and skips all retention"
}

test_previous_release_sha_mismatch_stops_before_build() {
  local case_dir="$tmp/previous-mismatch" release=20261006-ops-retention-abcdef3 previous=20260930-admin-design-system-abcdef0 commit=abcdef3123456789012345678901234567890123 status
  init_remote_fixture "$case_dir" "$release" "$previous" "$commit"
  printf 'deadbeef0123456789012345678901234567890123\n' >"$case_dir/jijia/releases/$previous/commit.txt"
  (cd "$case_dir/jijia/releases/$previous" && sha256sum Dockerfile commit.txt tarsgo-backend-linux-amd64 tarsgo-migrate-linux-amd64 >SHA256SUMS)
  set +e
  run_remote_deploy "$case_dir" "$release" "$release" "$previous" "$commit" 0 >/dev/null 2>&1
  status=$?
  set -e
  [[ "$status" -ne 0 ]] || fail "mismatched current image/release SHA unexpectedly deployed"
  ! grep -q '^build ' "$case_dir/docker.log" || fail "image build ran with mismatched previous_stable metadata"
  [[ ! -s "$case_dir/removed-images" ]] || fail "metadata mismatch invoked retention"
  pass "mismatched previous image/release SHA stops before build or retention"
}

test_backup_retention_waits_for_remote_checksum() {
  local case_dir="$tmp/backup" old_name=jijia-old.sql.gz status latest_archive output
  mkdir -p "$case_dir/bin" "$case_dir/source/data/upload" "$case_dir/local" "$case_dir/remote/incoming" "$case_dir/remote/store"
  printf 'services: {}\n' >"$case_dir/source/compose.yaml"
  printf 'DB_PASSWORD=secret\n' >"$case_dir/source/.env"
  printf 'JWT_SECRET=secret\n' >"$case_dir/source/app.env"
  printf 'upload fixture\n' >"$case_dir/source/data/upload/example.txt"
  printf old >"$case_dir/local/$old_name"
  printf old >"$case_dir/local/$old_name.sha256"
  printf old >"$case_dir/remote/store/jijia-full-20200101T000000Z.tar.gz"
  printf 'old checksum\n' >"$case_dir/remote/store/jijia-full-20200101T000000Z.tar.gz.sha256"
  python3 - "$case_dir/local/$old_name" "$case_dir/local/$old_name.sha256" "$case_dir/remote/store/jijia-full-20200101T000000Z.tar.gz" "$case_dir/remote/store/jijia-full-20200101T000000Z.tar.gz.sha256" <<'PY'
import os, sys, time
for path, days in zip(sys.argv[1:], (8, 8, 31, 31)):
    old = time.time() - days * 86400
    os.utime(path, (old, old))
PY
  cat >"$case_dir/bin/docker" <<'DOCKER'
#!/usr/bin/env bash
set -Eeuo pipefail
[[ "$1" == compose && "$2" == exec ]]
printf 'CREATE DATABASE fixture;\n'
DOCKER
  cat >"$case_dir/bin/scp" <<'SCP'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$MOCK_BACKUP_MODE" >>"$MOCK_SCP_LOG"
[[ "$MOCK_BACKUP_MODE" != scp-failure ]] || exit 1
[[ "$1" == -o ]]; shift 2
source_archive="$1"
source_checksum="$2"
mkdir -p "$MOCK_REMOTE_INCOMING"
cp "$source_archive" "$MOCK_REMOTE_INCOMING/"
cp "$source_checksum" "$MOCK_REMOTE_INCOMING/"
if [[ "$MOCK_BACKUP_MODE" == checksum-failure ]]; then
  archive_name="$(basename "$source_archive")"
  printf '%064d %s\n' 0 "$archive_name" >"$MOCK_REMOTE_INCOMING/$archive_name.sha256"
fi
SCP
  cat >"$case_dir/bin/ssh" <<'SSH'
#!/usr/bin/env bash
set -Eeuo pipefail
[[ "$1" == -o ]]; shift 2
shift
shift
shift
shift
backup_name="$1"
JIJIA_BACKUP_OWNER="$(id -un)" JIJIA_BACKUP_GROUP="$(id -gn)" JIJIA_BACKUP_STORE="$MOCK_REMOTE_STORE" JIJIA_BACKUP_INCOMING="$MOCK_REMOTE_INCOMING" bash "$MOCK_ACCEPT_SCRIPT" "$backup_name"
SSH
  chmod +x "$case_dir/bin/docker" "$case_dir/bin/scp" "$case_dir/bin/ssh"
  run_backup() {
    JIJIA_ROOT="$case_dir/source" JIJIA_BACKUP_DIR="$case_dir/local" \
    JIJIA_BACKUP_INCOMING="$case_dir/remote/incoming" JIJIA_BACKUP_REMOTE=fixture \
    DOCKER_BIN="$case_dir/bin/docker" SCP_BIN="$case_dir/bin/scp" SSH_BIN="$case_dir/bin/ssh" MOCK_BACKUP_MODE="$1" \
    MOCK_REMOTE_INCOMING="$case_dir/remote/incoming" MOCK_REMOTE_STORE="$case_dir/remote/store" MOCK_SCP_LOG="$case_dir/scp.log" \
    MOCK_ACCEPT_SCRIPT="$repo_root/scripts/accept-production-backup.sh" PATH="$case_dir/bin:$PATH" \
      bash "$repo_root/scripts/backup-production.sh"
  }
  set +e
  output="$(run_backup scp-failure 2>&1)"
  status=$?
  set -e
  [[ "$status" -ne 0 ]] || fail "SCP failure was reported as success, mock modes: $(cat "$case_dir/scp.log" 2>/dev/null || true); output: $output"
  [[ -e "$case_dir/local/$old_name" && -e "$case_dir/remote/store/jijia-full-20200101T000000Z.tar.gz" ]] || fail "SCP failure removed old backups"
  set +e
  run_backup checksum-failure >/dev/null 2>&1
  status=$?
  set -e
  [[ "$status" -ne 0 && -e "$case_dir/local/$old_name" && -e "$case_dir/remote/store/jijia-full-20200101T000000Z.tar.gz" ]] || fail "remote checksum failure triggered retention"
  run_backup success >/dev/null
  [[ ! -e "$case_dir/local/$old_name" && ! -e "$case_dir/remote/store/jijia-full-20200101T000000Z.tar.gz" ]] || fail "successful verified backup did not apply retention"
  latest_archive="$(find "$case_dir/local" -maxdepth 1 -name 'jijia-full-*.tar.gz' -print -quit)"
  [[ -n "$latest_archive" ]] || fail "successful backup archive missing"
  python3 - "$latest_archive" <<'PY'
import os, sys
assert os.stat(sys.argv[1]).st_mode & 0o777 == 0o600
PY
  tar -tzf "$latest_archive" | grep -Fxq .env || fail "backup omits required config snapshot"
  python3 - "$latest_archive" <<'PY'
import sys, tarfile
with tarfile.open(sys.argv[1], "r:gz") as archive:
    for name in (".env", "app.env", "compose.yaml", "database.sql.gz", "uploads.tar.gz"):
        assert archive.getmember(name).mode & 0o777 == 0o600, name
PY
  pass "local and remote retention waits for copy plus verified remote checksum"
}

test_guard_precedes_build
test_retention_keeps_two_releases
test_health_failure_skips_retention
test_previous_release_sha_mismatch_stops_before_build
test_backup_retention_waits_for_remote_checksum
echo "All production operations tests passed."
