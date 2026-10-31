#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/tarsgo-dev-startup.XXXXXXXX")"
trap 'rm -rf -- "$tmp"' EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

mkdir -p "$tmp/bin"
mkdir -p "$tmp/no-docker"
cat >"$tmp/bin/docker" <<'DOCKER'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$*" >"$MOCK_DOCKER_ARGS"
if [[ "$MOCK_DOCKER_STATUS" != 0 ]]; then
  echo "mock MariaDB health timeout" >&2
  exit "$MOCK_DOCKER_STATUS"
fi
DOCKER
chmod +x "$tmp/bin/docker"

if PATH="$tmp/no-docker" /bin/bash "$repo_root/scripts/start-db.sh" >"$tmp/missing-docker.log" 2>&1; then
  fail "database startup unexpectedly succeeded without Docker"
fi
grep -Fq 'Docker Compose v2 is required' "$tmp/missing-docker.log" || fail "missing Docker was not reported clearly"
pass "missing Docker is reported before attempting local database startup"

output="$(PATH="$tmp/bin:$PATH" MOCK_DOCKER_ARGS="$tmp/docker-args" MOCK_DOCKER_STATUS=0 DB_READY_TIMEOUT=7 bash "$repo_root/scripts/start-db.sh" 2>&1)" || fail "healthy database startup failed: $output"
grep -Fq 'compose -f database/docker-compose.yml up -d --wait --wait-timeout 7' "$tmp/docker-args" || fail "database startup did not wait on the Compose healthcheck"
[[ "$output" == *"MariaDB is healthy and ready"* ]] || fail "database success was not reported after health readiness"
pass "local database startup waits for its Docker healthcheck before reporting ready"

if PATH="$tmp/bin:$PATH" MOCK_DOCKER_ARGS="$tmp/docker-args" MOCK_DOCKER_STATUS=1 DB_READY_TIMEOUT=7 bash "$repo_root/scripts/start-db.sh" >"$tmp/unhealthy.log" 2>&1; then
  fail "unhealthy database startup unexpectedly succeeded"
fi
grep -Fq 'MariaDB did not become healthy within 7s' "$tmp/unhealthy.log" || fail "database timeout error was unclear"
if grep -Fq 'MariaDB is healthy and ready' "$tmp/unhealthy.log"; then
  fail "unhealthy database was reported as ready"
fi
pass "an unhealthy database exits with a clear error and is never reported ready"
