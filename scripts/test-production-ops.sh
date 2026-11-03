#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf -- "$tmp"' EXIT
test_tools="$tmp/test-tools"
mkdir -p "$test_tools"
cat >"$test_tools/sha256sum" <<'SHA256SUM'
#!/usr/bin/env perl
use strict;
use warnings;
use Digest::SHA;

if (@ARGV && $ARGV[0] eq "--check") {
    shift @ARGV;
    shift @ARGV if @ARGV && $ARGV[0] eq "--";
    my $status = 0;
    for my $manifest (@ARGV) {
        open my $input, "<", $manifest or die "cannot read $manifest: $!\n";
        while (my $line = <$input>) {
            chomp $line;
            my ($expected, $path) = $line =~ /\A([0-9a-f]{64})  (.+)\z/
                or die "invalid checksum line in $manifest\n";
            open my $file, "<:raw", $path or die "cannot read $path: $!\n";
            my $sha = Digest::SHA->new(256);
            $sha->addfile($file);
            if ($sha->hexdigest ne $expected) {
                print "$path: FAILED\n";
                $status = 1;
            }
        }
    }
    exit $status;
}

shift @ARGV if @ARGV && $ARGV[0] eq "--";
for my $path (@ARGV) {
    open my $file, "<:raw", $path or die "cannot read $path: $!\n";
    my $sha = Digest::SHA->new(256);
    $sha->addfile($file);
    print $sha->hexdigest, "  ", $path, "\n";
}
SHA256SUM
chmod +x "$test_tools/sha256sum"
export PATH="$test_tools:$PATH"

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

test_high_water_abort_precedes_release_operations() {
  local case_dir="$tmp/guard"
  mkdir -p "$case_dir/repo/scripts" "$case_dir/repo/public/assets/images" "$case_dir/bin"
  cp "$repo_root/scripts/deploy-production.sh" "$repo_root/scripts/production-safe-cleanup.sh" "$case_dir/repo/scripts/"
  printf 'fixture asset\n' >"$case_dir/repo/public/assets/images/example.webp"
  git init -q --bare "$case_dir/origin.git"
  git -C "$case_dir/repo" init -q -b main
  git -C "$case_dir/repo" config user.name OpsTest
  git -C "$case_dir/repo" config user.email ops-test@example.invalid
  git -C "$case_dir/repo" add scripts/deploy-production.sh scripts/production-safe-cleanup.sh public/assets/images/example.webp
  git -C "$case_dir/repo" commit -qm fixture
  git -C "$case_dir/repo" remote add origin "$case_dir/origin.git"
  git -C "$case_dir/repo" push -q -u origin main
  cat >"$case_dir/bin/ssh" <<'SSH'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$*" >>"$MOCK_SSH_LOG"
call_count="$(wc -l <"$MOCK_SSH_LOG")"
if (( call_count == 1 )); then
  exit 0
fi
if (( call_count == 2 )); then
    printf 'current_image=jijia-backend:20261001-stable-abcdef0\ncurrent_release=20261001-stable-abcdef0\ncurrent_commit=abcdef0123456789012345678901234567890123\ndisk_usage_percent=85\ntarget_release_status=complete\n'
    exit 0
fi
if (( call_count == 3 )); then
    cat >"$MOCK_RECEIVED_HELPER"
    echo "Production deploy aborted: root filesystem remains at 85% after safe cleanup; deployment requires usage below 85%." >&2
    exit 1
fi
exit 90
SSH
  cat >"$case_dir/bin/rsync" <<'RSYNC'
#!/usr/bin/env bash
exit 0
RSYNC
  chmod +x "$case_dir/bin/ssh" "$case_dir/bin/rsync"
  local output status
  set +e
  output="$(PATH="$case_dir/bin:$PATH" MOCK_SSH_LOG="$case_dir/ssh.log" MOCK_RECEIVED_HELPER="$case_dir/received-helper.sh" SSH_BIN=ssh RSYNC_BIN=rsync "$case_dir/repo/scripts/deploy-production.sh" 2>&1)"
  status=$?
  set -e
  [[ "$status" -ne 0 ]] || fail "high-water cleanup failure unexpectedly allowed deployment"
  [[ "$output" == *"remains at 85% after safe cleanup"* ]] || fail "high-water deploy message was unclear: $output"
  [[ ! -e "$case_dir/build-ran" ]] || fail "release operations ran before the disk guard"
  [[ "$(wc -l <"$case_dir/ssh.log")" -eq 3 ]] || fail "deploy performed an unexpected production operation after the disk guard"
  cmp -s "$case_dir/repo/scripts/production-safe-cleanup.sh" "$case_dir/received-helper.sh" || fail "safe cleanup was not the first remote operation"
  pass "85% high-water cleanup failure stops before release upload or production mutation"
}

test_already_deployed_commit_is_idempotent() {
  local case_dir="$tmp/already-deployed"
  mkdir -p "$case_dir/repo/scripts" "$case_dir/repo/public/assets/images" "$case_dir/bin"
  cp "$repo_root/scripts/deploy-production.sh" "$case_dir/repo/scripts/"
  printf 'fixture asset\n' >"$case_dir/repo/public/assets/images/example.webp"
  git init -q --bare "$case_dir/origin.git"
  git -C "$case_dir/repo" init -q -b main
  git -C "$case_dir/repo" config user.name OpsTest
  git -C "$case_dir/repo" config user.email ops-test@example.invalid
  git -C "$case_dir/repo" add scripts/deploy-production.sh public/assets/images/example.webp
  git -C "$case_dir/repo" commit -qm fixture
  git -C "$case_dir/repo" remote add origin "$case_dir/origin.git"
  git -C "$case_dir/repo" push -q -u origin main
  local deployed_commit deployed_release
  deployed_commit="$(git -C "$case_dir/repo" rev-parse HEAD)"
  deployed_release="20261001-already-${deployed_commit:0:7}"
  cat >"$case_dir/bin/ssh" <<'SSH'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$*" >>"$MOCK_SSH_LOG"
if [[ "$(wc -l <"$MOCK_SSH_LOG")" -eq 1 ]]; then
  exit 0
fi
printf 'current_image=jijia-backend:%s\ncurrent_release=%s\ncurrent_commit=%s\ndisk_usage_percent=50\ntarget_release_status=complete\n' \
  "$MOCK_RELEASE" "$MOCK_RELEASE" "$MOCK_COMMIT"
SSH
  cat >"$case_dir/bin/make" <<'MAKE'
#!/usr/bin/env bash
touch "$MOCK_BUILD_MARKER"
MAKE
  chmod +x "$case_dir/bin/ssh" "$case_dir/bin/make"
  local output
  output="$(PATH="$case_dir/bin:$PATH" MOCK_SSH_LOG="$case_dir/ssh.log" MOCK_BUILD_MARKER="$case_dir/build-ran" MOCK_RELEASE="$deployed_release" MOCK_COMMIT="$deployed_commit" SSH_BIN=ssh RSYNC_BIN=missing-rsync "$case_dir/repo/scripts/deploy-production.sh" 2>&1)" || fail "same-commit deployment status check failed: $output"
  [[ "$output" == *"Production deployment already healthy"* && "$output" == *"$deployed_commit"* ]] || fail "same-commit deployment was not clearly reported: $output"
  [[ "$(wc -l <"$case_dir/ssh.log")" -eq 2 ]] || fail "same-commit check continued into deployment operations"
  [[ ! -e "$case_dir/build-ran" ]] || fail "same-commit check unnecessarily built a release"
  pass "a healthy already-deployed commit returns success without building or mutating production"
}

test_missing_rsync_fails_before_cleanup_or_build() {
  local case_dir="$tmp/missing-rsync"
  mkdir -p "$case_dir/repo/scripts" "$case_dir/repo/public/assets/images" "$case_dir/bin"
  cp "$repo_root/scripts/deploy-production.sh" "$case_dir/repo/scripts/"
  printf 'fixture asset\n' >"$case_dir/repo/public/assets/images/example.webp"
  git init -q --bare "$case_dir/origin.git"
  git -C "$case_dir/repo" init -q -b main
  git -C "$case_dir/repo" config user.name OpsTest
  git -C "$case_dir/repo" config user.email ops-test@example.invalid
  git -C "$case_dir/repo" add scripts/deploy-production.sh public/assets/images/example.webp
  git -C "$case_dir/repo" commit -qm fixture
  git -C "$case_dir/repo" remote add origin "$case_dir/origin.git"
  git -C "$case_dir/repo" push -q -u origin main
  cat >"$case_dir/bin/ssh" <<'SSH'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$*" >>"$MOCK_SSH_LOG"
if [[ "$(wc -l <"$MOCK_SSH_LOG")" -eq 1 ]]; then exit 0; fi
printf 'current_image=jijia-backend:20261001-stable-abcdef0\ncurrent_release=20261001-stable-abcdef0\ncurrent_commit=abcdef0123456789012345678901234567890123\ndisk_usage_percent=90\ntarget_release_status=missing\n'
SSH
  chmod +x "$case_dir/bin/ssh"
  local output status
  set +e
  output="$(PATH="$case_dir/bin:$PATH" MOCK_SSH_LOG="$case_dir/ssh.log" SSH_BIN=ssh RSYNC_BIN=missing-rsync "$case_dir/repo/scripts/deploy-production.sh" 2>&1)"
  status=$?
  set -e
  [[ "$status" -ne 0 && "$output" == *"required local tool 'missing-rsync' is unavailable"* ]] || fail "missing rsync was not reported clearly: $output"
  [[ "$(wc -l <"$case_dir/ssh.log")" -eq 2 ]] || fail "deployment continued after missing rsync"
  pass "missing transfer tooling fails clearly before cleanup or build"
}

test_missing_ssh_fails_before_remote_access() {
  local case_dir="$tmp/missing-ssh"
  mkdir -p "$case_dir/repo/scripts" "$case_dir/repo/public/assets/images"
  cp "$repo_root/scripts/deploy-production.sh" "$case_dir/repo/scripts/"
  printf 'fixture asset\n' >"$case_dir/repo/public/assets/images/example.webp"
  git init -q --bare "$case_dir/origin.git"
  git -C "$case_dir/repo" init -q -b main
  git -C "$case_dir/repo" config user.name OpsTest
  git -C "$case_dir/repo" config user.email ops-test@example.invalid
  git -C "$case_dir/repo" add scripts/deploy-production.sh public/assets/images/example.webp
  git -C "$case_dir/repo" commit -qm fixture
  git -C "$case_dir/repo" remote add origin "$case_dir/origin.git"
  git -C "$case_dir/repo" push -q -u origin main
  local output status
  set +e
  output="$(SSH_BIN=missing-ssh "$case_dir/repo/scripts/deploy-production.sh" 2>&1)"
  status=$?
  set -e
  [[ "$status" -ne 0 && "$output" == *"required local tool 'missing-ssh' is unavailable (non-interactive production access)"* ]] || fail "missing SSH was not reported clearly: $output"
  pass "missing SSH fails immediately with a clear non-interactive access error"
}

make_ci_client_system_bin() {
  local destination="$1" tool source
  mkdir -p "$destination"
  for tool in bash env git date mktemp mkdir cp chmod rm cat wc awk sed tail perl tar gzip install mv dirname touch; do
    source="$(command -v "$tool")" || fail "required test fixture command is unavailable: $tool"
    ln -s "$source" "$destination/$tool"
  done
}

init_ci_deploy_fixture() {
  local case_dir="$1" mode="$2" repo="$1/repo" artifact_dir="$1/artifact" remote_root="$1/remote"
  local commit artifact_commit asset_digest
  local -a archive_files
  mkdir -p "$repo/scripts" "$case_dir/client-bin" "$case_dir/remote-bin" "$artifact_dir" "$remote_root/releases/20261001-stable-abcdef0"
  make_ci_client_system_bin "$case_dir/client-system-bin"
  cp "$repo_root/scripts/deploy-production.sh" "$repo_root/scripts/production-safe-cleanup.sh" \
    "$repo_root/scripts/backup-production.sh" "$repo_root/scripts/backup-production.service" \
    "$repo_root/scripts/backup-production.timer" "$repo_root/scripts/deploy-production-remote.sh" "$repo/scripts/"
  git init -q --bare "$case_dir/origin.git"
  git -C "$repo" init -q -b main
  git -C "$repo" config user.name OpsTest
  git -C "$repo" config user.email ops-test@example.invalid
  git -C "$repo" add scripts
  git -C "$repo" commit -qm fixture
  git -C "$repo" remote add origin "$case_dir/origin.git"
  git -C "$repo" push -q -u origin main
  commit="$(git -C "$repo" rev-parse HEAD)"
  printf '%s\n' "$commit" >"$case_dir/commit"

  artifact_commit="$commit"
  [[ "$mode" != commit-mismatch ]] || artifact_commit=deadbeef0123456789012345678901234567890123
  printf 'production Dockerfile fixture\n' >"$artifact_dir/Dockerfile"
  printf '%s\n' "$artifact_commit" >"$artifact_dir/commit.txt"
  printf 'linux amd64 backend fixture\n' >"$artifact_dir/tarsgo-backend-linux-amd64"
  printf 'linux amd64 migration fixture\n' >"$artifact_dir/tarsgo-migrate-linux-amd64"
  [[ "$mode" != package-missing-file ]] || rm "$artifact_dir/tarsgo-migrate-linux-amd64"
  local manifest_files=(Dockerfile commit.txt tarsgo-backend-linux-amd64)
  [[ ! -f "$artifact_dir/tarsgo-migrate-linux-amd64" ]] || manifest_files+=(tarsgo-migrate-linux-amd64)
  (cd "$artifact_dir" && sha256sum "${manifest_files[@]}" >SHA256SUMS)
  [[ "$mode" != package-corrupt ]] || printf 'damaged binary fixture\n' >"$artifact_dir/tarsgo-backend-linux-amd64"

  archive_files=(Dockerfile SHA256SUMS commit.txt tarsgo-backend-linux-amd64)
  [[ ! -f "$artifact_dir/tarsgo-migrate-linux-amd64" ]] || archive_files+=(tarsgo-migrate-linux-amd64)
  (cd "$artifact_dir" && tar -czf "$case_dir/artifact.tar.gz" "${archive_files[@]}" 2>/dev/null)
  asset_digest="$(perl -MDigest::SHA -e 'my $sha = Digest::SHA->new(256); open my $file, "<:raw", $ARGV[0] or die $!; $sha->addfile($file); print $sha->hexdigest' "$case_dir/artifact.tar.gz")"
  cp "$case_dir/artifact.tar.gz" "$case_dir/download.tar.gz"
  [[ "$mode" != download-corrupt ]] || printf 'transport corruption\n' >>"$case_dir/download.tar.gz"
  [[ "$mode" != release-download-missing ]] || rm "$case_dir/download.tar.gz"
  if [[ "$mode" == artifact-missing ]]; then
    printf '{"tag_name":"production-artifacts","draft":false,"prerelease":true,"assets":[]}\n' >"$case_dir/release.json"
  else
    printf '{"tag_name":"production-artifacts","draft":false,"prerelease":true,"assets":[{"name":"tarsgo-production-release.tar.gz","state":"uploaded","size":100,"digest":"sha256:%s","browser_download_url":"https://github.com/Tyr1onX/tarsgo-website/releases/download/production-artifacts/tarsgo-production-release.tar.gz"}]}\n' "$asset_digest" >"$case_dir/release.json"
  fi

  cat >"$case_dir/client-bin/curl" <<'CURL'
#!/usr/bin/env bash
set -Eeuo pipefail
url=""
output=""
while (($#)); do
  case "$1" in
    --output|-o) output="$2"; shift 2 ;;
    https://*) url="$1"; shift ;;
    *) shift ;;
  esac
done
case "$url" in
  "https://api.github.com/repos/Tyr1onX/tarsgo-website/releases/tags/production-artifacts")
    cat "$MOCK_RELEASE_METADATA" ;;
  "https://github.com/Tyr1onX/tarsgo-website/releases/download/production-artifacts/tarsgo-production-release.tar.gz")
    [[ -n "$output" ]] || { echo "missing release asset output path" >&2; exit 2; }
    [[ -s "$MOCK_RELEASE_ASSET_DOWNLOAD" ]] || exit 22
    cp "$MOCK_RELEASE_ASSET_DOWNLOAD" "$output" ;;
  *) echo "unexpected GitHub request: $url" >&2; exit 90 ;;
esac
CURL
  cat >"$case_dir/client-bin/ssh" <<'SSH'
#!/usr/bin/env bash
set -Eeuo pipefail
while [[ "${1:-}" == -o ]]; do shift 2; done
[[ "${1:-}" == racknerd ]] || { echo "unexpected SSH target: ${1:-}" >&2; exit 90; }
shift
command="${1:-}"
shift || true
count=0
[[ ! -f "$MOCK_SSH_COUNT" ]] || read -r count <"$MOCK_SSH_COUNT"
((count += 1))
printf '%s\n' "$count" >"$MOCK_SSH_COUNT"
case "$count" in
  1) [[ "$command" == true ]] ;;
  2)
    printf 'current_image=jijia-backend:20261001-stable-abcdef0\ncurrent_release=20261001-stable-abcdef0\ncurrent_commit=abcdef0123456789012345678901234567890123\ndisk_usage_percent=50\ntarget_release_status=missing\n'
    ;;
  3)
    cat >/dev/null
    printf 'safe_cleanup_performed=1\n'
    ;;
  4|5)
    [[ "$command" == bash && "${1:-}" == -s ]] || { echo "unexpected remote shell request" >&2; exit 90; }
    PATH="$MOCK_REMOTE_BIN:$MOCK_TEST_TOOLS:/usr/bin:/bin" "$command" "$@"
    ;;
  6) cat >/dev/null ;;
  7)
    cat >/dev/null
    touch "$MOCK_DEPLOY_REACHED"
    printf 'mock production deployment completed\n'
    ;;
  *) echo "unexpected SSH call $count: $command $*" >&2; exit 90 ;;
esac
SSH
  cat >"$case_dir/client-bin/rsync" <<'RSYNC'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$*" >>"$MOCK_RSYNC_LOG"
source_path="${@: -2:1}"
destination="${@: -1}"
case "$destination" in
  racknerd:*/.incoming-*/)
    remote_path="${destination#racknerd:}"
    staging_name="${remote_path%/}"
    staging_name="${staging_name##*/}"
    mkdir -p "$MOCK_REMOTE_ROOT/releases/$staging_name"
    cp -R "${source_path%/}/." "$MOCK_REMOTE_ROOT/releases/$staging_name/"
    printf '%s\n' "${staging_name#.incoming-}" >"$MOCK_RELEASE_NAME" ;;
  racknerd:/tmp/) ;;
  *) echo "unexpected rsync destination: $destination" >&2; exit 90 ;;
esac
RSYNC
  if [[ "$mode" == success-node26 ]]; then
    cat >"$case_dir/client-bin/node" <<'NODE'
#!/usr/bin/env bash
printf 'Node 26 dynamic library error: simdjson not loaded\n' >&2
touch "$MOCK_NODE_INVOKED"
exit 127
NODE
  fi
  cat >"$case_dir/remote-bin/sha256sum" <<'REMOTE_SHA256SUM'
#!/usr/bin/env bash
exec "$MOCK_TEST_TOOLS/sha256sum" "$@"
REMOTE_SHA256SUM
  mkdir -p "$remote_root/releases/20261001-stable-abcdef0"
  cat >"$remote_root/compose.yaml" <<'COMPOSE'
services:
  app:
    image: jijia-backend:20261001-stable-abcdef0
    build: ./releases/20261001-stable-abcdef0
  db:
    image: mariadb:11.4
COMPOSE
  chmod +x "$case_dir/client-bin/curl" "$case_dir/client-bin/ssh" "$case_dir/client-bin/rsync" "$case_dir/remote-bin/sha256sum"
  [[ ! -e "$case_dir/client-bin/node" ]] || chmod +x "$case_dir/client-bin/node"
}

run_ci_deploy_fixture() {
  local case_dir="$1" commit
  commit="$(cat "$case_dir/commit")"
  CI_DEPLOY_STATUS=0
  set +e
  CI_DEPLOY_OUTPUT="$(PATH="$case_dir/client-bin:$case_dir/client-system-bin" \
    MOCK_EXPECTED_COMMIT="$commit" MOCK_RELEASE_METADATA="$case_dir/release.json" \
    MOCK_RELEASE_ASSET_DOWNLOAD="$case_dir/download.tar.gz" \
    MOCK_REMOTE_ROOT="$case_dir/remote" MOCK_REMOTE_BIN="$case_dir/remote-bin" MOCK_TEST_TOOLS="$test_tools" \
    MOCK_SSH_COUNT="$case_dir/ssh-count" MOCK_RSYNC_LOG="$case_dir/rsync.log" MOCK_RELEASE_NAME="$case_dir/release-name" \
    MOCK_DEPLOY_REACHED="$case_dir/deploy-reached" MOCK_NODE_INVOKED="$case_dir/node-invoked" \
    SSH_BIN=ssh RSYNC_BIN=rsync JIJIA_ROOT="$case_dir/remote" \
    "$case_dir/repo/scripts/deploy-production.sh" 2>&1)"
  CI_DEPLOY_STATUS=$?
  set -e
}

test_ci_artifact_deployment_ignores_local_toolchain() {
  local case_dir="$tmp/ci-artifact-node26" commit release client_path
  case_dir="$tmp/ci-artifact-node26"
  init_ci_deploy_fixture "$case_dir" success-node26
  commit="$(cat "$case_dir/commit")"
  client_path="$case_dir/client-bin:$case_dir/client-system-bin"
  if PATH="$client_path" command -v sha256sum >/dev/null 2>&1; then
    fail "client regression PATH unexpectedly contains sha256sum"
  fi
  [[ ":$client_path:" != *":/sbin:"* ]] || fail "client regression PATH unexpectedly contains /sbin"
  run_ci_deploy_fixture "$case_dir"
  [[ "$CI_DEPLOY_STATUS" -eq 0 ]] || fail "CI artifact deployment failed without local build/hash tools: $CI_DEPLOY_OUTPUT"
  [[ -e "$case_dir/deploy-reached" ]] || fail "mock production cutover did not run with the CI artifact"
  [[ ! -e "$case_dir/node-invoked" ]] || fail "local Node 26 was invoked during production deployment"
  [[ "$(cat "$case_dir/ssh-count")" == 7 ]] || fail "CI artifact deployment did not complete all mocked remote stages"
  release="$(cat "$case_dir/release-name")"
  [[ "$(cat "$case_dir/remote/releases/$release/commit.txt")" == "$commit" ]] || fail "uploaded CI artifact commit does not match the clean main checkout"
  (cd "$case_dir/remote/releases/$release" && sha256sum --check -- SHA256SUMS) >/dev/null || fail "uploaded CI artifact failed the production-side SHA256 check"
  pass "public CI release asset completes the mocked production release when Node 26 is broken and local sha256sum, /sbin, Go, and Corepack are absent"

  local no_frontend="$tmp/ci-artifact-no-frontend"
  init_ci_deploy_fixture "$no_frontend" success-no-frontend
  for tool in node corepack pnpm go make; do
    if PATH="$no_frontend/client-bin:$no_frontend/client-system-bin" command -v "$tool" >/dev/null 2>&1; then
      fail "no-frontend regression PATH unexpectedly contains $tool"
    fi
  done
  run_ci_deploy_fixture "$no_frontend"
  [[ "$CI_DEPLOY_STATUS" -eq 0 && -e "$no_frontend/deploy-reached" ]] || fail "CI artifact deployment required a local frontend build environment: $CI_DEPLOY_OUTPUT"
  pass "CI release deployment succeeds with no local Node, Corepack, pnpm, Go, or Make"
}

test_ci_artifact_rejections_precede_production_mutation() {
  local mode case_dir
  for mode in artifact-missing release-download-missing download-corrupt package-corrupt package-missing-file commit-mismatch; do
    case_dir="$tmp/ci-artifact-$mode"
    init_ci_deploy_fixture "$case_dir" "$mode"
    run_ci_deploy_fixture "$case_dir"
    [[ "$CI_DEPLOY_STATUS" -ne 0 ]] || fail "$mode CI artifact unexpectedly proceeded to deployment"
    case "$mode" in
      artifact-missing)
        [[ "$CI_DEPLOY_OUTPUT" == *"does not contain exactly one complete"* ]] || fail "missing release asset was rejected for the wrong reason: $CI_DEPLOY_OUTPUT" ;;
      release-download-missing)
        [[ "$CI_DEPLOY_OUTPUT" == *"unable to anonymously download the public CI release asset"* ]] || fail "unavailable release asset was rejected for the wrong reason: $CI_DEPLOY_OUTPUT" ;;
      download-corrupt)
        [[ "$CI_DEPLOY_OUTPUT" == *"release asset SHA-256 does not match GitHub metadata"* ]] || fail "corrupt release download was rejected for the wrong reason: $CI_DEPLOY_OUTPUT" ;;
      package-corrupt|package-missing-file|commit-mismatch)
        [[ "$CI_DEPLOY_OUTPUT" == *"CI release asset is incomplete, damaged, or does not match commit"* ]] || fail "$mode release asset was rejected for the wrong reason: $CI_DEPLOY_OUTPUT" ;;
    esac
    [[ "$(cat "$case_dir/ssh-count")" == 2 ]] || fail "$mode CI artifact reached production cleanup or upload"
    [[ ! -e "$case_dir/rsync.log" && ! -e "$case_dir/deploy-reached" ]] || fail "$mode CI artifact caused production transfer or cutover"
  done
  pass "missing, damaged, incomplete, and commit-mismatched CI release assets are rejected before production mutation"
}

make_safe_cleanup_mock_bin() {
  mkdir -p "$1"
  cat >"$1/docker" <<'DOCKER'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$*" >>"$MOCK_DOCKER_LOG"
command="$1"
shift
case "$command" in
  compose)
    [[ "$*" == *" ps -q app" ]] && { echo app; exit 0; }
    ;;
  inspect)
    if [[ "$2" == *".Config.Image"* && "$3" == app ]]; then
      printf '%s\n' "$MOCK_CURRENT_IMAGE"
      exit 0
    fi
    ;;
  image)
    subcommand="$1"
    shift
    case "$subcommand" in
      inspect) grep -Fxq -- "$1" "$MOCK_IMAGE_NAMES" ;;
      ls)
        if [[ "${2:-}" == *Repository* ]]; then cat "$MOCK_IMAGE_NAMES"; else sed 's#^jijia-backend:##' "$MOCK_IMAGE_NAMES"; fi
        ;;
      rm)
        printf '%s\n' "$1" >>"$MOCK_REMOVED_IMAGES"
        sed "\\|^$1\$|d" "$MOCK_IMAGE_NAMES" >"$MOCK_IMAGE_NAMES.tmp"
        mv "$MOCK_IMAGE_NAMES.tmp" "$MOCK_IMAGE_NAMES"
        ;;
      *) exit 90 ;;
    esac
    ;;
  builder)
    [[ "$*" == "prune --force" ]] || exit 90
    if [[ "$MOCK_LOWER_USAGE" == 1 ]]; then printf '84\n' >"$MOCK_USAGE_FILE"; fi
    ;;
  *) exit 90 ;;
esac
DOCKER
  cat >"$1/df" <<'DF'
#!/usr/bin/env bash
set -Eeuo pipefail
usage="$(cat "$MOCK_USAGE_FILE")"
printf 'Filesystem 1024-blocks Used Available Use%% Mounted on\nmock 100 80 20 %s%% /\n' "$usage"
DF
  cat >"$1/apt-get" <<'APT'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$*" >>"$MOCK_APT_LOG"
[[ "$*" == clean ]]
APT
  chmod +x "$1/docker" "$1/df" "$1/apt-get"
}

init_safe_cleanup_fixture() {
  local case_dir="$1" current=20261006-current-abcdef1 previous=20261001-previous-abcdef0 stale=20260901-stale-7654321
  mkdir -p "$case_dir/bin" "$case_dir/jijia/releases/$current" "$case_dir/jijia/releases/$previous" "$case_dir/jijia/releases/$stale" "$case_dir/jijia/backups" "$case_dir/apt/lists/partial"
  make_safe_cleanup_mock_bin "$case_dir/bin"
  cat >"$case_dir/jijia/compose.yaml" <<COMPOSE
services:
  app:
    image: jijia-backend:$current
    build: ./releases/$current
COMPOSE
  cat >"$case_dir/jijia/.production-retention-state" <<STATE
current_image=jijia-backend:$current
current_release=$current
previous_image=jijia-backend:$previous
previous_release=$previous
STATE
  printf 'jijia-backend:%s\njijia-backend:%s\njijia-backend:%s\n' "$current" "$previous" "$stale" >"$case_dir/image-names"
  printf 'old backup\n' >"$case_dir/jijia/backups/jijia-full-20200101T000000Z.tar.gz"
  printf 'old checksum\n' >"$case_dir/jijia/backups/jijia-full-20200101T000000Z.tar.gz.sha256"
  printf 'apt cache\n' >"$case_dir/apt/lists/package-index"
  python3 - "$case_dir/jijia/backups/jijia-full-20200101T000000Z.tar.gz" "$case_dir/jijia/backups/jijia-full-20200101T000000Z.tar.gz.sha256" <<'PY'
import os, sys, time
for path in sys.argv[1:]:
    old = time.time() - 31 * 86400
    os.utime(path, (old, old))
PY
  : >"$case_dir/docker.log"
  : >"$case_dir/removed-images"
  printf '90\n' >"$case_dir/usage"
}

run_safe_cleanup() {
  local case_dir="$1" lower_usage="$2" pending_release="${3:-}"
  local args=("$case_dir/jijia")
  [[ -z "$pending_release" ]] || args+=("$pending_release")
  MOCK_DOCKER_LOG="$case_dir/docker.log" MOCK_IMAGE_NAMES="$case_dir/image-names" \
  MOCK_REMOVED_IMAGES="$case_dir/removed-images" MOCK_CURRENT_IMAGE="$(sed -n 's/^    image: //p' "$case_dir/jijia/compose.yaml")" \
  MOCK_USAGE_FILE="$case_dir/usage" MOCK_LOWER_USAGE="$lower_usage" MOCK_APT_LOG="$case_dir/apt.log" \
  APT_LISTS_DIR="$case_dir/apt/lists" PATH="$case_dir/bin:$PATH" \
    bash "$repo_root/scripts/production-safe-cleanup.sh" "${args[@]}"
}

test_safe_cleanup_and_fresh_threshold() {
  local case_dir="$tmp/safe-cleanup" stale=20260901-stale-7654321 pending=20261007-pending-fedcba1 status
  init_safe_cleanup_fixture "$case_dir"
  mkdir -p "$case_dir/jijia/releases/$pending"
  run_safe_cleanup "$case_dir" 1 "$pending" >/dev/null
  [[ "$(cat "$case_dir/usage")" == 84 ]] || fail "cleanup did not recheck disk usage"
  [[ ! -e "$case_dir/jijia/releases/$stale" ]] || fail "safe cleanup left an unprotected old release"
  grep -Fxq 'jijia-backend:20261006-current-abcdef1' "$case_dir/image-names" || fail "safe cleanup removed current image"
  grep -Fxq 'jijia-backend:20261001-previous-abcdef0' "$case_dir/image-names" || fail "safe cleanup removed previous image"
  grep -Fxq 'jijia-backend:20260901-stale-7654321' "$case_dir/removed-images" || fail "safe cleanup did not remove explicitly stale Jijia image"
  [[ -e "$case_dir/jijia/releases/20261006-current-abcdef1" && -e "$case_dir/jijia/releases/20261001-previous-abcdef0" ]] || fail "safe cleanup removed a protected release"
  [[ -d "$case_dir/jijia/releases/$pending" ]] || fail "safe cleanup removed the release being prepared for deployment"
  [[ ! -e "$case_dir/jijia/backups/jijia-full-20200101T000000Z.tar.gz" ]] || fail "safe cleanup retained a backup older than 30 days"
  [[ ! -e "$case_dir/apt/lists/package-index" ]] || fail "safe cleanup retained rebuildable APT lists"
  ! grep -Eq 'system prune|volume prune|image prune' "$case_dir/docker.log" || fail "safe cleanup invoked a forbidden global prune"
  pass "safe cleanup preserves current/previous, removes only eligible cache and stale Jijia artifacts, then accepts usage below 85%"

  local below_dir="$tmp/safe-cleanup-below"
  init_safe_cleanup_fixture "$below_dir"
  printf '84\n' >"$below_dir/usage"
  run_safe_cleanup "$below_dir" 1 >/dev/null
  [[ ! -s "$below_dir/docker.log" && -e "$below_dir/jijia/backups/jijia-full-20200101T000000Z.tar.gz" ]] || fail "cleanup ran below the 85% threshold"
  pass "usage below 85% skips cleanup"

  local ambiguous_dir="$tmp/safe-cleanup-ambiguous"
  init_safe_cleanup_fixture "$ambiguous_dir"
  rm -f "$ambiguous_dir/jijia/.production-retention-state"
  run_safe_cleanup "$ambiguous_dir" 1 >/dev/null
  [[ -d "$ambiguous_dir/jijia/releases/20260901-stale-7654321" ]] || fail "ambiguous history was deleted without an exact current/previous pair"
  grep -Fxq 'jijia-backend:20260901-stale-7654321' "$ambiguous_dir/image-names" || fail "ambiguous image history was deleted"
  pass "ambiguous Jijia history is preserved"

  local full_dir="$tmp/safe-cleanup-still-high"
  init_safe_cleanup_fixture "$full_dir"
  set +e
  run_safe_cleanup "$full_dir" 0 >/dev/null 2>&1
  status=$?
  set -e
  [[ "$status" -ne 0 && "$(cat "$full_dir/usage")" == 90 ]] || fail "cleanup did not abort while usage remained at or above 85%"
  pass "usage at or above 85% after cleanup aborts"
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
      if [[ "$object" == db ]]; then
        if [[ "$MOCK_FAIL_DATABASE" == 1 ]]; then echo unhealthy; else echo healthy; fi
        exit 0
      fi
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
        if [[ "${1:-}" == --format ]]; then
          format="$2"
          object="$3"
          field=""
          case "$format" in
            '{{.Parent}}') field=2 ;;
            '{{json .RepoTags}}') field=3 ;;
            *) exit 90 ;;
          esac
          awk -F '|' -v id="$object" -v column="$field" '
            $1 == id { print $column; found=1; exit }
            END { if (!found) exit 1 }
          ' "$MOCK_IMAGE_GRAPH"
          exit $?
        fi
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
        [[ ! -f "$MOCK_BLOCKED_PARENTS" ]] || {
          if grep -Fxq -- "$object" "$MOCK_BLOCKED_PARENTS"; then exit 1; fi
        }
        printf '%s\n' "$object" >>"$MOCK_REMOVED_IMAGES"
        sed "\|^$object\$|d" "$MOCK_IMAGE_NAMES" >"$MOCK_IMAGE_NAMES.tmp"
        mv "$MOCK_IMAGE_NAMES.tmp" "$MOCK_IMAGE_NAMES"
        awk -F '|' -v id="$object" '$1 != id' "$MOCK_IMAGE_GRAPH" >"$MOCK_IMAGE_GRAPH.tmp"
        mv "$MOCK_IMAGE_GRAPH.tmp" "$MOCK_IMAGE_GRAPH"
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
  run)
    if [[ "$MOCK_FAIL_MIGRATION" == 1 ]]; then
      echo "mock migration failure" >&2
      exit 23
    fi
    exit 0
    ;;
  ps)
    if [[ "$*" == "-aq --filter ancestor="* ]]; then
      object="${*: -1}"
      object="${object#ancestor=}"
      if grep -Fxq -- "$object" "$MOCK_BUSY_PARENTS"; then echo protected_container; fi
      exit 0
    fi
    echo "jijia-app mock healthy"
    exit 0
    ;;
esac
echo "unexpected mocked docker command: $command $*" >&2
exit 90
DOCKER
  cat >"$1/curl" <<'CURL'
#!/usr/bin/env bash
set -Eeuo pipefail
running="$(cat "$MOCK_RUNNING_IMAGE")"
[[ "$MOCK_FAIL_HEALTH" != 1 || "$running" != "$MOCK_NEW_IMAGE" ]] || exit 22
printf 200
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
  : >"$case_dir/image-graph"
  : >"$case_dir/busy-parents"
  : >"$case_dir/blocked-parents"
}

run_remote_deploy() {
  local case_dir="$1" release="$2" tag="$3" previous="$4" commit="$5" fail_health="$6" fail_database="${7:-0}" fail_migration="${8:-0}"
  MOCK_DOCKER_LOG="$case_dir/docker.log" MOCK_COMPOSE="$case_dir/jijia/compose.yaml" \
  MOCK_RUNNING_IMAGE="$case_dir/running-image" MOCK_IMAGE_NAMES="$case_dir/image-names" \
  MOCK_REMOVED_IMAGES="$case_dir/removed-images" MOCK_NEW_IMAGE="jijia-backend:$tag" \
  MOCK_IMAGE_GRAPH="$case_dir/image-graph" MOCK_BUSY_PARENTS="$case_dir/busy-parents" \
  MOCK_BLOCKED_PARENTS="$case_dir/blocked-parents" \
  MOCK_FAIL_HEALTH="$fail_health" MOCK_FAIL_DATABASE="$fail_database" MOCK_FAIL_MIGRATION="$fail_migration" PATH="$case_dir/bin:$PATH" \
  HEALTH_ATTEMPTS=2 HEALTH_INTERVAL=0 bash "$repo_root/scripts/deploy-production-remote.sh" \
    "$case_dir/jijia" "$release" "$tag" "jijia-backend:$previous" "$previous" "$commit"
}

test_database_unready_stops_before_build_or_migration() {
  local case_dir="$tmp/database-unready" release=20261006-ops-retention-abcdef9 previous=20260930-admin-design-system-abcdef0 commit=abcdef9123456789012345678901234567890123 status
  init_remote_fixture "$case_dir" "$release" "$previous" "$commit"
  set +e
  run_remote_deploy "$case_dir" "$release" "$release" "$previous" "$commit" 0 1 >"$case_dir/output.log" 2>&1
  status=$?
  set -e
  [[ "$status" -ne 0 ]] || fail "deployment unexpectedly proceeded with an unhealthy database"
  grep -Fq 'database did not become healthy before image build or migration' "$case_dir/output.log" || fail "unhealthy database error was unclear"
  ! grep -q '^build ' "$case_dir/docker.log" || fail "image build ran before database readiness"
  ! grep -q '^run ' "$case_dir/docker.log" || fail "migration ran before database readiness"
  [[ "$(cat "$case_dir/running-image")" == "jijia-backend:$previous" ]] || fail "unready database changed the running application"
  pass "production waits for database health and stops before image build or migration when it never becomes ready"
}

test_migration_failure_preserves_previous_release() {
  local case_dir="$tmp/migration-failure" release=20261006-ops-retention-abcdef8 previous=20260930-admin-design-system-abcdef0 commit=abcdef8123456789012345678901234567890123 status
  init_remote_fixture "$case_dir" "$release" "$previous" "$commit"
  set +e
  run_remote_deploy "$case_dir" "$release" "$release" "$previous" "$commit" 0 0 1 >"$case_dir/output.log" 2>&1
  status=$?
  set -e
  [[ "$status" -ne 0 ]] || fail "deployment unexpectedly succeeded after a failed database migration"
  grep -Fq 'mock migration failure' "$case_dir/output.log" || fail "migration failure was not preserved in the deployment output"
  [[ "$(cat "$case_dir/running-image")" == "jijia-backend:$previous" ]] || fail "migration failure changed the running application"
  grep -Fq "image: jijia-backend:$previous" "$case_dir/jijia/compose.yaml" || fail "migration failure changed production compose configuration"
  ! grep -q 'compose up -d --no-deps app' "$case_dir/docker.log" || fail "app restart ran after migration failure"
  [[ ! -s "$case_dir/removed-images" ]] || fail "migration failure invoked retention"
  pass "a failed database migration stops before switching compose or restarting the current app"
}

test_interrupted_release_upload_can_be_retried() {
  local case_dir="$tmp/release-upload-retry" root release commit previous current prepare_script finalize_script payload
  root="$case_dir/jijia"
  release=20261031-ops-retention-abcdef0
  commit=abcdef0123456789012345678901234567890123
  current=20261020-current-1234567
  previous=20261010-previous-7654321
  prepare_script="$case_dir/prepare-release.sh"
  finalize_script="$case_dir/finalize-release.sh"
  payload="$case_dir/payload"
  mkdir -p "$root/releases/$current" "$root/releases/$previous" "$root/releases/$release" "$root/releases/.incoming-$release" "$payload"
  printf 'services:\n  app:\n    image: jijia-backend:%s\n    build: ./releases/%s\n  db:\n    image: mariadb:11.4\n' "$current" "$current" >"$root/compose.yaml"
  printf 'previous_release=%s\n' "$previous" >"$root/.production-retention-state"
  printf 'wrong commit\n' >"$root/releases/$release/commit.txt"
  printf 'interrupted rsync\n' >"$root/releases/.incoming-$release/partial"
  printf '%s\n' "$commit" >"$payload/commit.txt"
  printf 'production dockerfile\n' >"$payload/Dockerfile"
  printf 'backend artifact\n' >"$payload/tarsgo-backend-linux-amd64"
  printf 'migration artifact\n' >"$payload/tarsgo-migrate-linux-amd64"
  (cd "$payload" && sha256sum Dockerfile commit.txt tarsgo-backend-linux-amd64 tarsgo-migrate-linux-amd64 >SHA256SUMS)
  awk -v marker=PREPARE_RELEASE_UPLOAD '!capturing && index($0, "<<\047" marker "\047") { capturing=1; next } capturing && $0 == marker { exit } capturing { print }' "$repo_root/scripts/deploy-production.sh" >"$prepare_script"
  awk -v marker=FINALIZE_RELEASE_UPLOAD '!capturing && index($0, "<<\047" marker "\047") { capturing=1; next } capturing && $0 == marker { exit } capturing { print }' "$repo_root/scripts/deploy-production.sh" >"$finalize_script"
  [[ -s "$prepare_script" && -s "$finalize_script" ]] || fail "release upload steps could not be extracted for recovery verification"
  bash -s -- "$root" "$release" <"$prepare_script" || fail "retry did not reset the interrupted target and staging directory"
  [[ ! -e "$root/releases/$release" && ! -e "$root/releases/.incoming-$release/partial" ]] || fail "retry retained partial release data"
  cp "$payload"/* "$root/releases/.incoming-$release/"
  bash -s -- "$root" "$release" "$commit" <"$finalize_script" || fail "verified release upload did not finalize"
  [[ ! -e "$root/releases/.incoming-$release" ]] || fail "finalized staging directory remains"
  [[ "$(cat "$root/releases/$release/commit.txt")" == "$commit" ]] || fail "finalized release commit metadata is wrong"
  (cd "$root/releases/$release" && sha256sum --check -- SHA256SUMS >/dev/null) || fail "finalized retry release checksum is invalid"
  pass "an interrupted upload is reset, re-uploaded to staging, checksum-verified, and atomically finalized"
}

test_retention_keeps_two_releases() {
  local case_dir="$tmp/retention" release=20261006-ops-retention-abcdef1 previous=20260930-admin-design-system-abcdef0 commit=abcdef1123456789012345678901234567890123 expected actual
  init_remote_fixture "$case_dir" "$release" "$previous" "$commit"
  run_remote_deploy "$case_dir" "$release" "$release" "$previous" "$commit" 0 >/dev/null
  expected="$(printf '%s\n%s\n' "$release" "$previous" | sort | tr '\n' ' ')"
  actual="$(sed 's#^jijia-backend:##' "$case_dir/image-names" | sort | tr '\n' ' ')"
  [[ "$actual" == "$expected" ]] || fail "retention left unexpected jijia-backend tags: $actual"
  [[ -d "$case_dir/jijia/releases/$release" && -d "$case_dir/jijia/releases/$previous" ]] || fail "current/previous releases missing after retention"
  grep -Fxq "current_image=jijia-backend:$release" "$case_dir/jijia/.production-retention-state" || fail "current image was not recorded for future safe cleanup"
  grep -Fxq "current_release=$release" "$case_dir/jijia/.production-retention-state" || fail "current release was not recorded for future safe cleanup"
  grep -Fxq "previous_image=jijia-backend:$previous" "$case_dir/jijia/.production-retention-state" || fail "previous image was not recorded for future safe cleanup"
  grep -Fxq "previous_release=$previous" "$case_dir/jijia/.production-retention-state" || fail "previous release was not recorded for future safe cleanup"
  [[ ! -e "$case_dir/jijia/releases/20260901-old-release-7654321" ]] || fail "old release directory survived retention"
  pass "successful deployment retention keeps current and previous image/release"
}

test_retention_reclaims_only_retired_jijia_parent_chain() {
  local case_dir="$tmp/parent-chain" release=20261006-ops-retention-abcdef4 previous=20260930-admin-design-system-abcdef0 commit=abcdef4123456789012345678901234567890123
  local parent_a parent_b common_base other_parent
  printf -v parent_a 'sha256:%064d' 101
  printf -v parent_b 'sha256:%064d' 102
  printf -v common_base 'sha256:%064d' 103
  printf -v other_parent 'sha256:%064d' 104
  init_remote_fixture "$case_dir" "$release" "$previous" "$commit"
  cat >"$case_dir/image-graph" <<GRAPH
jijia-backend:20260815-stale-tag-1234567|$parent_a|["jijia-backend:20260815-stale-tag-1234567"]
$parent_a|$parent_b|[]
$parent_b|$common_base|[]
$common_base||["alpine:3"]
$other_parent||[]
GRAPH
  run_remote_deploy "$case_dir" "$release" "$release" "$previous" "$commit" 0 >/dev/null
  grep -Fxq "$parent_a" "$case_dir/removed-images" || fail "retired Jijia image parent was not removed"
  grep -Fxq "$parent_b" "$case_dir/removed-images" || fail "retired Jijia image grandparent was not removed"
  ! grep -Fxq "$common_base" "$case_dir/removed-images" || fail "tagged common base image was removed"
  ! grep -Fxq "$other_parent" "$case_dir/removed-images" || fail "unrelated image was removed"
  grep -Fxq "jijia-backend:$previous" "$case_dir/image-names" || fail "rollback image was removed"
  grep -Fxq "jijia-backend:$release" "$case_dir/image-names" || fail "current image was removed"
  ! grep -Eq 'system prune|volume prune|image prune' "$case_dir/docker.log" || fail "retention used global prune"
  pass "retired Jijia image parents are reclaimed without touching tagged bases or unrelated images"
}

test_retention_skips_referenced_parents() {
  local release=20261006-ops-retention-abcdef5 previous=20260930-admin-design-system-abcdef0 commit=abcdef5123456789012345678901234567890123 case_dir
  local parent_a parent_b
  printf -v parent_a 'sha256:%064d' 201
  printf -v parent_b 'sha256:%064d' 202

  case_dir="$tmp/parent-busy"
  init_remote_fixture "$case_dir" "$release" "$previous" "$commit"
  printf 'jijia-backend:20260815-stale-tag-1234567|%s|["jijia-backend:20260815-stale-tag-1234567"]\n%s|%s|[]\n' "$parent_a" "$parent_a" "$parent_b" >"$case_dir/image-graph"
  printf '%s\n' "$parent_a" >"$case_dir/busy-parents"
  run_remote_deploy "$case_dir" "$release" "$release" "$previous" "$commit" 0 >/dev/null
  ! grep -Fxq "$parent_a" "$case_dir/removed-images" || fail "parent with container references was removed"
  pass "parent chains used by running or stopped containers are preserved"

  case_dir="$tmp/parent-blocked"
  init_remote_fixture "$case_dir" "$release" "$previous" "$commit"
  printf 'jijia-backend:20260815-stale-tag-1234567|%s|["jijia-backend:20260815-stale-tag-1234567"]\n%s|%s|[]\n%s||[]\n' "$parent_a" "$parent_a" "$parent_b" "$parent_b" >"$case_dir/image-graph"
  printf '%s\n' "$parent_a" >"$case_dir/blocked-parents"
  run_remote_deploy "$case_dir" "$release" "$release" "$previous" "$commit" 0 >/dev/null 2>&1
  ! grep -Fxq "$parent_a" "$case_dir/removed-images" || fail "image rejected by Docker was marked as removed"
  ! grep -Fxq "$parent_b" "$case_dir/removed-images" || fail "traversal continued past a protected parent"
  pass "Docker image conflicts stop parent cleanup without failing a healthy deploy"
}

test_health_failure_skips_retention() {
  local case_dir="$tmp/health-failure" release=20261006-ops-retention-abcdef2 previous=20260930-admin-design-system-abcdef0 commit=abcdef2123456789012345678901234567890123 status output
  init_remote_fixture "$case_dir" "$release" "$previous" "$commit"
  set +e
  output="$(run_remote_deploy "$case_dir" "$release" "$release" "$previous" "$commit" 1 2>&1)"
  status=$?
  set -e
  [[ "$status" -ne 0 ]] || fail "unhealthy deployment unexpectedly succeeded"
  [[ "$output" == *"Production health check failed; no retention will run."* ]] || fail "unhealthy deployment did not report the failed production health check"
  [[ "$output" != *"health_http_status=200"* ]] || fail "unhealthy deployment printed a successful production health status"
  [[ "$(cat "$case_dir/running-image")" == "jijia-backend:$previous" ]] || fail "previous image was not restored"
  grep -Fxq 'jijia-backend:20260815-stale-tag-1234567' "$case_dir/image-names" || fail "health failure deleted an old image"
  [[ -d "$case_dir/jijia/releases/20260901-old-release-7654321" ]] || fail "health failure deleted an old release"
  [[ ! -s "$case_dir/removed-images" ]] || fail "health failure invoked image retention"
  [[ ! -e "$case_dir/jijia/.production-retention-state" ]] || fail "health failure updated the successful retention state"
  [[ "$(cat "$case_dir/running-image")" == "jijia-backend:$previous" ]] || fail "health failure did not restore the previous image"
  run_remote_deploy "$case_dir" "$release" "$release" "$previous" "$commit" 0 >/dev/null
  [[ "$(cat "$case_dir/running-image")" == "jijia-backend:$release" ]] || fail "retry did not deploy the previously uploaded release"
  grep -Fxq "current_release=$release" "$case_dir/jijia/.production-retention-state" || fail "successful retry did not record its release"
  pass "health failure restores previous app and skips all retention"
  pass "a failed release can be retried after rollback and becomes current only after health succeeds"
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
  local case_dir="$tmp/backup" old_name=jijia-old.sql.gz retained_name=jijia-full-20261001T000000Z.tar.gz status latest_archive archive_name local_checksum remote_archive remote_checksum output
  mkdir -p "$case_dir/bin" "$case_dir/source/data/upload" "$case_dir/local" "$case_dir/remote/incoming" "$case_dir/remote/store"
  printf 'services: {}\n' >"$case_dir/source/compose.yaml"
  printf 'DB_PASSWORD=secret\n' >"$case_dir/source/.env"
  printf 'JWT_SECRET=secret\n' >"$case_dir/source/app.env"
  printf 'upload fixture\n' >"$case_dir/source/data/upload/example.txt"
  printf old >"$case_dir/local/$old_name"
  printf old >"$case_dir/local/$old_name.sha256"
  printf old >"$case_dir/remote/store/jijia-full-20200101T000000Z.tar.gz"
  printf 'old checksum\n' >"$case_dir/remote/store/jijia-full-20200101T000000Z.tar.gz.sha256"
  printf recent >"$case_dir/local/$retained_name"
  printf 'recent checksum\n' >"$case_dir/local/$retained_name.sha256"
  printf recent >"$case_dir/remote/store/$retained_name"
  printf 'recent checksum\n' >"$case_dir/remote/store/$retained_name.sha256"
  python3 - \
    "$case_dir/local/$old_name" "$case_dir/local/$old_name.sha256" \
    "$case_dir/remote/store/jijia-full-20200101T000000Z.tar.gz" "$case_dir/remote/store/jijia-full-20200101T000000Z.tar.gz.sha256" \
    "$case_dir/local/$retained_name" "$case_dir/local/$retained_name.sha256" \
    "$case_dir/remote/store/$retained_name" "$case_dir/remote/store/$retained_name.sha256" <<'PY'
import os, sys, time
for path, days in zip(sys.argv[1:], (31, 31, 31, 31, 6, 6, 29, 29)):
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
    local mock_mode="$1"
    shift
    JIJIA_ROOT="$case_dir/source" JIJIA_BACKUP_DIR="${MOCK_LOCAL_BACKUP_DIR:-$case_dir/local}" \
    JIJIA_BACKUP_INCOMING="$case_dir/remote/incoming" JIJIA_BACKUP_REMOTE=fixture \
    DOCKER_BIN="$case_dir/bin/docker" SCP_BIN="$case_dir/bin/scp" SSH_BIN="$case_dir/bin/ssh" MOCK_BACKUP_MODE="$mock_mode" \
    MOCK_REMOTE_INCOMING="$case_dir/remote/incoming" MOCK_REMOTE_STORE="$case_dir/remote/store" MOCK_SCP_LOG="$case_dir/scp.log" \
    MOCK_ACCEPT_SCRIPT="$repo_root/scripts/accept-production-backup.sh" PATH="$case_dir/bin:$PATH" \
      bash "$repo_root/scripts/backup-production.sh" "$@"
  }
  set +e
  output="$(run_backup scp-failure 2>&1)"
  status=$?
  set -e
  [[ "$status" -ne 0 ]] || fail "SCP failure was reported as success, mock modes: $(cat "$case_dir/scp.log" 2>/dev/null || true); output: $output"
  [[ -e "$case_dir/local/$old_name" && -e "$case_dir/local/$old_name.sha256" && -e "$case_dir/remote/store/jijia-full-20200101T000000Z.tar.gz" && -e "$case_dir/remote/store/jijia-full-20200101T000000Z.tar.gz.sha256" ]] || fail "SCP failure removed old backups or checksums"
  set +e
  run_backup checksum-failure >/dev/null 2>&1
  status=$?
  set -e
  [[ "$status" -ne 0 && -e "$case_dir/local/$old_name" && -e "$case_dir/local/$old_name.sha256" && -e "$case_dir/remote/store/jijia-full-20200101T000000Z.tar.gz" && -e "$case_dir/remote/store/jijia-full-20200101T000000Z.tar.gz.sha256" ]] || fail "remote checksum failure triggered retention"
  touch "$case_dir/backup-started"
  run_backup success >/dev/null
  [[ ! -e "$case_dir/local/$old_name" && ! -e "$case_dir/local/$old_name.sha256" && ! -e "$case_dir/remote/store/jijia-full-20200101T000000Z.tar.gz" && ! -e "$case_dir/remote/store/jijia-full-20200101T000000Z.tar.gz.sha256" ]] || fail "successful verified backup did not remove expired backups and checksums"
  [[ -e "$case_dir/local/$retained_name" && -e "$case_dir/local/$retained_name.sha256" && -e "$case_dir/remote/store/$retained_name" && -e "$case_dir/remote/store/$retained_name.sha256" ]] || fail "retention removed a backup that was within its retention window"
  latest_archive="$(find "$case_dir/local" -maxdepth 1 -name 'jijia-full-*.tar.gz' -newer "$case_dir/backup-started" -print -quit)"
  [[ -n "$latest_archive" ]] || fail "successful backup archive missing"
  archive_name="$(basename "$latest_archive")"
  local_checksum="$latest_archive.sha256"
  remote_archive="$case_dir/remote/store/$archive_name"
  remote_checksum="$remote_archive.sha256"
  [[ -f "$local_checksum" && -f "$remote_archive" && -f "$remote_checksum" ]] || fail "successful backup is missing its local or remote archive/checksum"
  cmp -s "$latest_archive" "$remote_archive" || fail "remote archive differs from the locally verified archive"
  cmp -s "$local_checksum" "$remote_checksum" || fail "remote checksum manifest differs from the local manifest"
  (cd "$case_dir/local" && sha256sum --check -- "$archive_name.sha256") >/dev/null || fail "local archive checksum did not verify"
  (cd "$case_dir/remote/store" && sha256sum --check -- "$archive_name.sha256") >/dev/null || fail "remote archive checksum did not verify"
  python3 - "$latest_archive" "$local_checksum" "$remote_archive" "$remote_checksum" "$case_dir/local" "$case_dir/remote/store" "$case_dir/remote/incoming" <<'PY'
import gzip
import io
import os
import sys
import tarfile

local_archive, local_checksum, remote_archive, remote_checksum, local_dir, remote_store, remote_incoming = sys.argv[1:]
for path in (local_archive, local_checksum, remote_archive, remote_checksum):
    assert os.stat(path).st_mode & 0o777 == 0o600, f"{path} permissions are not 0600"
for path in (local_dir, remote_store, remote_incoming):
    assert os.stat(path).st_mode & 0o777 == 0o700, f"{path} permissions are not 0700"

expected = {".env", "app.env", "compose.yaml", "database.sql.gz", "uploads.tar.gz"}
with tarfile.open(local_archive, "r:gz") as archive:
    members = {member.name: member for member in archive.getmembers()}
    assert expected.issubset(members), f"backup omits required snapshots: {sorted(expected - members.keys())}"
    contents = {}
    for name in expected:
        member = members[name]
        assert member.isfile(), f"{name} is not a regular file"
        assert member.mode & 0o777 == 0o600, f"{name} permissions are not 0600"
        extracted = archive.extractfile(member)
        assert extracted is not None, f"{name} cannot be read"
        contents[name] = extracted.read()

assert contents[".env"] == b"DB_PASSWORD=secret\n", ".env snapshot content is incorrect"
assert contents["app.env"] == b"JWT_SECRET=secret\n", "app.env snapshot content is incorrect"
assert contents["compose.yaml"] == b"services: {}\n", "compose.yaml snapshot content is incorrect"
assert b"CREATE DATABASE fixture;" in gzip.decompress(contents["database.sql.gz"]), "database dump is missing from the archive"
with tarfile.open(fileobj=io.BytesIO(gzip.decompress(contents["uploads.tar.gz"])), mode="r:") as uploads:
    assert "upload/example.txt" in uploads.getnames(), "upload snapshot is missing from the archive"
    uploaded = uploads.extractfile("upload/example.txt")
    assert uploaded is not None and uploaded.read() == b"upload fixture\n", "upload snapshot content is incorrect"
PY
  # Deployment mode must produce a complete, verified local archive without
  # calling Tencent, even when the mocked remote would reject every upload.
  local local_only_dir="$case_dir/local-only" local_only_archive remote_count_before remote_count_after
  mkdir -p "$local_only_dir"
  printf 'expired\n' >"$local_only_dir/jijia-old.sql.gz"
  old_backup_time="$(date -d '31 days ago' '+%Y%m%d%H%M.%S' 2>/dev/null || date -v-31d '+%Y%m%d%H%M.%S')"
  touch -t "$old_backup_time" "$local_only_dir/jijia-old.sql.gz"
  remote_count_before="$(find "$case_dir/remote/store" -type f | wc -l)"
  : >"$case_dir/scp.log"
  output="$(MOCK_LOCAL_BACKUP_DIR="$local_only_dir" run_backup scp-failure --local-only)"
  [[ "$output" == *"Tencent transfer skipped"* ]] || fail "local-only backup mode was not reported"
  [[ ! -s "$case_dir/scp.log" ]] || fail "local-only backup attempted an SCP transfer"
  local_only_archive="$(find "$local_only_dir" -maxdepth 1 -type f -name 'jijia-full-*.tar.gz' -print -quit)"
  [[ -n "$local_only_archive" && -f "$local_only_archive.sha256" ]] || fail "local-only backup is missing archive or checksum"
  (cd "$local_only_dir" && sha256sum --check -- "$(basename "$local_only_archive").sha256") >/dev/null || fail "local-only backup checksum failed"
  tar -tzf "$local_only_archive" | grep -Fxq 'database.sql.gz' || fail "local-only backup lost the database dump"
  tar -tzf "$local_only_archive" | grep -Fxq 'uploads.tar.gz' || fail "local-only backup lost uploaded files"
  [[ ! -e "$local_only_dir/jijia-old.sql.gz" ]] || fail "local-only backup failed 30-day retention"
  remote_count_after="$(find "$case_dir/remote/store" -type f | wc -l)"
  [[ "$remote_count_after" == "$remote_count_before" ]] || fail "local-only backup changed remote storage"
  [[ "$(grep -Fxc 'ExecStart=/opt/jijia/jijia-backup.sh' "$repo_root/scripts/backup-production.service")" == 1 ]] || fail "scheduled backup must continue using the default offsite mode"
  ! grep -Fq 'jijia-backup.sh" --local-only' "$repo_root/scripts/deploy-production.sh" || fail "standard deployment still forces a local backup"
  grep -Fq 'production_backup_mode=skipped' "$repo_root/scripts/deploy-production.sh" || fail "standard deployment does not skip backups"
  grep -Fq 'ssh_run "$jijia_root/jijia-backup.sh" --offsite' "$repo_root/scripts/deploy-production.sh" || fail "required offsite deployment mode is missing"
  grep -Fq 'target_release_status=complete' "$repo_root/scripts/deploy-production.sh" || fail "same-commit release reuse is missing"
  grep -Fq '.incoming-$release_name' "$repo_root/scripts/deploy-production.sh" || fail "resumable staged release upload is missing"
  grep -Fq -- '--rsh="$rsync_ssh"' "$repo_root/scripts/deploy-production.sh" || fail "rsync does not use the non-interactive SSH options"
  grep -Fq 'sha256sum --check -- SHA256SUMS' "$repo_root/scripts/deploy-production.sh" || fail "release upload integrity is not verified"
  grep -Fq 'download_production_release_asset "$commit_sha"' "$repo_root/scripts/deploy-production.sh" || fail "deployment does not download the release asset for the verified main commit"
  ! grep -Eq 'make_bin|build-linux-amd64|frontend-toolchain|require_command sha256sum' "$repo_root/scripts/deploy-production.sh" || fail "production deployment still depends on local build or checksum tools"
  grep -Fq 'actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9' "$repo_root/.github/workflows/production-ops.yml" || fail "CI does not upload the built production artifact"
  grep -Fq 'actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333' "$repo_root/.github/workflows/production-ops.yml" || fail "CI does not transfer the built artifact to the release publisher"
  grep -Fq 'gh release upload production-artifacts' "$repo_root/.github/workflows/production-ops.yml" || fail "CI does not publish an unauthenticated production release asset"
  ! grep -Fq '/actions/artifacts/' "$repo_root/scripts/deploy-production.sh" || fail "deployment still attempts the login-protected Actions artifact download"
  grep -Fq 'OnCalendar=Sat *-*-* 19:00:00 UTC' "$repo_root/scripts/backup-production.timer" || fail "offsite backup is not scheduled weekly"
  grep -Fq 'retention_minutes=43200' "$repo_root/scripts/backup-production.sh" || fail "local retention is not 30 days"
  grep -Fq 'retention_minutes=43200' "$repo_root/scripts/production-safe-cleanup.sh" || fail "disk cleanup retention is not 30 days"
  pass "normal deployments skip backups; manual local and forced offsite modes remain; weekly timer verified"
  pass "archive contents, local/remote permissions and checksums, and 30/30-day retention verified"
}

test_high_water_abort_precedes_release_operations
test_already_deployed_commit_is_idempotent
test_missing_rsync_fails_before_cleanup_or_build
test_missing_ssh_fails_before_remote_access
test_ci_artifact_deployment_ignores_local_toolchain
test_ci_artifact_rejections_precede_production_mutation
test_safe_cleanup_and_fresh_threshold
test_database_unready_stops_before_build_or_migration
test_migration_failure_preserves_previous_release
test_interrupted_release_upload_can_be_retried
test_retention_keeps_two_releases
test_retention_reclaims_only_retired_jijia_parent_chain
test_retention_skips_referenced_parents
test_health_failure_skips_retention
test_previous_release_sha_mismatch_stops_before_build
test_backup_retention_waits_for_remote_checksum
echo "All production operations tests passed."
