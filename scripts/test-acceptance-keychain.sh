#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT
mock_bin="$tmp_dir/bin"
mkdir -p "$mock_bin" "$tmp_dir/home"

cat >"$mock_bin/security" <<'MOCK_SECURITY'
#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "find-generic-password" ]]; then
  account=""
  while (($#)); do
    if [[ "$1" == "-a" ]]; then
      account="$2"
      shift 2
    else
      shift
    fi
  done
  printf '%s\n' "$account" >>"$KEYCHAIN_READ_LOG"
  printf 'mock-secret-%s\n' "$account"
  exit 0
fi
if [[ "$1" == "add-generic-password" ]]; then
  echo "unexpected keychain write in existing-item test" >&2
  exit 1
fi
echo "unexpected security command: $1" >&2
exit 2
MOCK_SECURITY
chmod +x "$mock_bin/security"

for command_name in mariadbd mariadb mariadb-admin mariadb-install-db; do
  cat >"$mock_bin/$command_name" <<'MOCK_COMMAND'
#!/usr/bin/env bash
exit 0
MOCK_COMMAND
  chmod +x "$mock_bin/$command_name"
done

cat >"$mock_bin/curl" <<'MOCK_CURL'
#!/usr/bin/env bash
for arg in "$@"; do
  if [[ "$arg" == "%{http_code}" ]]; then
    printf '401'
    exit 0
  fi
done
exit 0
MOCK_CURL
chmod +x "$mock_bin/curl"

SCRIPT_PATH="$repo_root/scripts/acceptance-env.sh" \
HOME="$tmp_dir/home" \
PATH="$mock_bin:$PATH" \
KEYCHAIN_READ_LOG="$tmp_dir/keychain-reads.log" \
bash -c 'set -- status; source "$SCRIPT_PATH"; load_credentials'

expected="$(printf '%s\n' TEST_ADMIN TEST_SUPER_ADMIN TEST_USER database-password jwt-secret mailbox-token | sort)"
actual="$(sort "$tmp_dir/keychain-reads.log")"
if [[ "$actual" != "$expected" ]]; then
  echo "Expected exactly one read for each existing credential." >&2
  diff -u <(printf '%s\n' "$expected") <(printf '%s\n' "$actual") >&2 || true
  exit 1
fi

echo "Acceptance credential loading reads each existing keychain item once."
