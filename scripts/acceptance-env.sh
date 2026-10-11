#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="$HOME/Library/Application Support/TarsGo/Acceptance"
DB_DIR="$STATE_DIR/mariadb"
LOG_DIR="$STATE_DIR/logs"
PID_DIR="$STATE_DIR/pids"
MAILBOX_FILE="$STATE_DIR/mailbox/messages.jsonl"
KEYCHAIN_MARKER="$STATE_DIR/keychain-ready"
SERVICE="com.tarsgo.acceptance"
APP_BIN="$ROOT_DIR/dist/tarsgo-backend"
MAIL_BIN="$ROOT_DIR/dist/tarsgo-test-mailbox"
DATA_BIN="$ROOT_DIR/dist/tarsgo-acceptance-data"

mkdir -p "$STATE_DIR" "$LOG_DIR" "$PID_DIR" "$STATE_DIR/mailbox" "$DB_DIR"
chmod 700 "$STATE_DIR" "$LOG_DIR" "$PID_DIR" "$STATE_DIR/mailbox" "$DB_DIR"

MARIADBD="$(command -v mariadbd || true)"
MARIADB="$(command -v mariadb || true)"
MARIADB_ADMIN="$(command -v mariadb-admin || true)"
INSTALL_DB="$(command -v mariadb-install-db || true)"
MARIADB_BASE=""
if [[ -z "$MARIADBD" || -z "$MARIADB" || -z "$MARIADB_ADMIN" || -z "$INSTALL_DB" ]]; then
  echo "Homebrew MariaDB binaries are required (mariadbd, mariadb, mariadb-admin, mariadb-install-db)." >&2
  exit 1
fi
MARIADB_BASE="$(python3 -c 'import os,sys; print(os.path.dirname(os.path.dirname(os.path.realpath(sys.argv[1]))))' "$MARIADBD")"

keychain_get() {
  security find-generic-password -s "$SERVICE" -a "$1" -w 2>/dev/null
}

keychain_load() {
  local name="$1" length="${2:-32}" value
  if value="$(keychain_get "$name")"; then
    printf '%s' "$value"
    return
  fi
  if [[ -f "$KEYCHAIN_MARKER" ]]; then
    echo "Credential store item $name is missing; refusing to replace it because its account already exists." >&2
    exit 1
  fi
  value="$(openssl rand -hex "$length")"
  security add-generic-password -U -s "$SERVICE" -a "$name" -w "$value" >/dev/null
  printf '%s' "$value"
  unset value
}

load_credentials() {
  DB_PASSWORD="$(keychain_load database-password 32)"
  JWT_SECRET_VALUE="$(keychain_load jwt-secret 32)"
  MAILBOX_TOKEN="$(keychain_load mailbox-token 32)"
  TEST_USER_PASSWORD="$(keychain_load TEST_USER 24)"
  TEST_ADMIN_PASSWORD="$(keychain_load TEST_ADMIN 24)"
  TEST_SUPER_ADMIN_PASSWORD="$(keychain_load TEST_SUPER_ADMIN 24)"
}

acceptance_environment() {
  export TARSGO_ACCEPTANCE_HOME="$STATE_DIR"
  export APP_ENV=acceptance APP_HOST=127.0.0.1 APP_PORT=8182 GIN_MODE=release APP_AUTO_MIGRATE=true
  export DB_HOST=127.0.0.1 DB_PORT=3317 DB_NAME=tarsgo_acceptance DB_USER=tarsgo_acceptance DB_PASSWORD
  export DB_MAX_IDLE_CONNS=2 DB_MAX_OPEN_CONNS=5 DB_CONN_MAX_LIFETIME_MINUTES=30
  export JWT_SECRET="$JWT_SECRET_VALUE" JWT_COOKIE_SECURE=false
  export EMAIL_API_URL=http://127.0.0.1:8126/emails EMAIL_API_KEY="$MAILBOX_TOKEN"
  export EMAIL_FROM='[TEST] TarsGo Acceptance <no-reply@tarsgo.test>'
  export TARSGO_ACCEPTANCE_SEED=true
  export TARSGO_TEST_USER_PASSWORD="$TEST_USER_PASSWORD"
  export TARSGO_TEST_ADMIN_PASSWORD="$TEST_ADMIN_PASSWORD"
  export TARSGO_TEST_SUPER_ADMIN_PASSWORD="$TEST_SUPER_ADMIN_PASSWORD"
  unset RESEND_API_KEY || true
}

port_is_listening() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

verify_database_instance() {
  local user details actual_dir actual_port expected_dir
  user="$(id -un)"
  details="$("$MARIADB" --no-defaults --protocol=socket --socket="$STATE_DIR/mariadb.sock" -u"$user" --batch --skip-column-names -e 'SELECT @@datadir, @@port' 2>/dev/null)" || {
    echo "Cannot identify the MariaDB instance behind the dedicated acceptance socket." >&2
    return 1
  }
  IFS=$'\t' read -r actual_dir actual_port <<< "$details"
  actual_dir="$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$actual_dir")"
  expected_dir="$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$DB_DIR")"
  if [[ "$actual_dir" != "$expected_dir" || "$actual_port" != 3317 ]]; then
    echo "MariaDB socket points to an unexpected data directory or port; refusing to use or stop it." >&2
    return 1
  fi
}

pid_matches() {
  local pid_file="$1" expected="$2" pid command
  [[ -f "$pid_file" ]] || return 1
  pid="$(cat "$pid_file")"
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  command="$(ps -p "$pid" -o command= 2>/dev/null || true)"
  [[ "$command" == *"$expected"* ]]
}

start_database() {
  local pid_file="$PID_DIR/mariadb.pid" socket="$STATE_DIR/mariadb.sock" user
  user="$(id -un)"
  if "$MARIADB_ADMIN" --no-defaults --protocol=socket --socket="$socket" -u"$user" ping >/dev/null 2>&1; then
    verify_database_instance
    return
  fi
  if port_is_listening 3317; then
    echo "Port 3317 is already used by an unrelated process; refusing to interact with it." >&2
    exit 1
  fi
  if [[ ! -d "$DB_DIR/mysql" ]]; then
    if [[ -n "$(find "$DB_DIR" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
      echo "Acceptance database directory exists but is not initialized; refusing to alter it." >&2
      exit 1
    fi
    "$INSTALL_DB" --no-defaults --basedir="$MARIADB_BASE" --datadir="$DB_DIR" --auth-root-authentication-method=socket --auth-root-socket-user="$user" --skip-test-db >/dev/null
  fi
  nohup "$MARIADBD" --no-defaults --basedir="$MARIADB_BASE" \
    --datadir="$DB_DIR" --socket="$socket" --pid-file="$PID_DIR/mariadb-server.pid" \
    --port=3317 --bind-address=127.0.0.1 --skip-name-resolve \
    --innodb-buffer-pool-size=64M --performance-schema=OFF --max-connections=20 \
    --log-error="$LOG_DIR/mariadb-error.log" >"$LOG_DIR/mariadb-stdout.log" 2>&1 &
  echo $! > "$pid_file"
  chmod 600 "$pid_file"
  for _ in $(seq 1 60); do
    if "$MARIADB_ADMIN" --no-defaults --protocol=socket --socket="$socket" -u"$user" ping >/dev/null 2>&1; then
      verify_database_instance
      return
    fi
    sleep 1
  done
  echo "Isolated MariaDB did not become ready; see $LOG_DIR/mariadb-error.log." >&2
  exit 1
}

configure_database() {
  local user socket="$STATE_DIR/mariadb.sock"
  user="$(id -un)"
  verify_database_instance
  "$MARIADB" --no-defaults --protocol=socket --socket="$socket" -u"$user" <<SQL
CREATE DATABASE IF NOT EXISTS tarsgo_acceptance CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'tarsgo_acceptance'@'127.0.0.1' IDENTIFIED BY '$DB_PASSWORD';
ALTER USER 'tarsgo_acceptance'@'127.0.0.1' IDENTIFIED BY '$DB_PASSWORD';
GRANT ALL PRIVILEGES ON tarsgo_acceptance.* TO 'tarsgo_acceptance'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL
}

build_binaries() {
  local shim_dir
  shim_dir="$(mktemp -d "${TMPDIR:-/tmp}/tarsgo-pnpm.XXXXXX")"
  cat > "$shim_dir/pnpm" <<'SHIM'
#!/usr/bin/env bash
exec npm exec --yes --package=pnpm@9.15.4 -- pnpm "$@"
SHIM
  chmod 700 "$shim_dir/pnpm"
  if ! (cd "$ROOT_DIR" && PATH="$shim_dir:$PATH" make build && go -C internal/backend build -buildvcs=false -o ../../dist/tarsgo-test-mailbox ./cmd/test-mailbox && go -C internal/backend build -buildvcs=false -o ../../dist/tarsgo-acceptance-data ./cmd/acceptance-data); then
    rm -rf "$shim_dir"
    return 1
  fi
  rm -rf "$shim_dir"
}

start_mailbox() {
  local pid_file="$PID_DIR/mailbox.pid"
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8126/ 2>/dev/null || true)"
  if pid_matches "$pid_file" "$MAIL_BIN" && [[ "$code" == 401 ]]; then
    return
  fi
  if port_is_listening 8126; then
    echo "Port 8126 is already used by an unrelated process; refusing to interact with it." >&2
    exit 1
  fi
  TARSGO_TEST_MAILBOX_TOKEN="$MAILBOX_TOKEN" nohup "$MAIL_BIN" -addr=127.0.0.1:8126 -store="$MAILBOX_FILE" >"$LOG_DIR/mailbox.log" 2>&1 &
  echo $! > "$pid_file"
  chmod 600 "$pid_file"
  for _ in $(seq 1 20); do
    code="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8126/ 2>/dev/null || true)"
    if [[ "$code" == 401 ]]; then
      return
    fi
    sleep 1
  done
  echo "Simulated mailbox did not become ready; see $LOG_DIR/mailbox.log." >&2
  exit 1
}

start_app() {
  local pid_file="$PID_DIR/app.pid"
  if pid_matches "$pid_file" "$APP_BIN" && curl -fsS http://127.0.0.1:8182/healthz >/dev/null; then
    return
  fi
  if port_is_listening 8182; then
    echo "Port 8182 is already used by an unrelated process; refusing to interact with it." >&2
    exit 1
  fi
  acceptance_environment
  cd "$STATE_DIR"
  nohup "$APP_BIN" >"$LOG_DIR/app.log" 2>&1 &
  echo $! > "$pid_file"
  chmod 600 "$pid_file"
  for _ in $(seq 1 60); do
    if curl -fsS http://127.0.0.1:8182/healthz >/dev/null 2>&1; then
      return
    fi
    sleep 1
  done
  echo "Acceptance app did not become healthy; see $LOG_DIR/app.log." >&2
  exit 1
}

stop_one() {
  local pid_file="$1" expected="$2" pid command
  [[ -f "$pid_file" ]] || return 0
  pid="$(cat "$pid_file")"
  if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then
    command="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    if [[ "$command" == *"$expected"* ]]; then
      kill "$pid"
      for _ in $(seq 1 20); do
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.2
      done
    fi
  fi
  rm -f "$pid_file"
}

status() {
  local app_status=stopped db_status=stopped mailbox_status=stopped
  curl -fsS http://127.0.0.1:8182/healthz >/dev/null 2>&1 && app_status=healthy
  "$MARIADB_ADMIN" --no-defaults --protocol=socket --socket="$STATE_DIR/mariadb.sock" -u"$(id -un)" ping >/dev/null 2>&1 && db_status=healthy
  local mailbox_code
  mailbox_code="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8126/ 2>/dev/null || true)"
  if [[ "$mailbox_code" == 401 ]]; then mailbox_status=ready; fi
  printf 'app: %s\ndatabase: %s\nsimulated mailbox: %s\nstate: %s\n' "$app_status" "$db_status" "$mailbox_status" "$STATE_DIR"
}

urls() {
  cat <<EOF
验收网站：       http://127.0.0.1:8182
模拟收件箱：     http://127.0.0.1:8126/ （HTTP Basic 用户 inbox；密码取 macOS 钥匙串项目 mailbox-token）
TEST_USER：      test-user@tarsgo.test （密码取钥匙串项目 TEST_USER）
TEST_ADMIN：     test-admin@tarsgo.test （密码取钥匙串项目 TEST_ADMIN）
TEST_SUPER_ADMIN：test-super-admin@tarsgo.test （密码取钥匙串项目 TEST_SUPER_ADMIN）
EOF
}

reset_data() {
  load_credentials
  start_database
  configure_database
  start_mailbox
  start_app
  touch "$KEYCHAIN_MARKER"
  chmod 600 "$KEYCHAIN_MARKER"
  acceptance_environment
  "$DATA_BIN" reset
  if ! curl --fail --silent --show-error --config - >/dev/null <<EOF
url = "http://127.0.0.1:8126/admin/clear"
request = "POST"
user = "inbox:$MAILBOX_TOKEN"
EOF
  then
    echo "Test data reset, but the mailbox could not be cleared; start the environment and retry reset-data." >&2
    return 1
  fi
  echo "Acceptance data and simulated mailbox reset; the three test accounts were preserved."
}

command_name="${1:-status}"
case "$command_name" in
  build)
    build_binaries
    ;;
  up)
    load_credentials
    if [[ ! -x "$APP_BIN" || ! -x "$MAIL_BIN" || ! -x "$DATA_BIN" ]]; then build_binaries; fi
    start_database
    configure_database
    start_mailbox
    start_app
    touch "$KEYCHAIN_MARKER"
    chmod 600 "$KEYCHAIN_MARKER"
    echo "Persistent isolated acceptance environment is ready."
    status
    urls
    ;;
  status)
    status
    ;;
  urls)
    urls
    ;;
  reset-data)
    if [[ ! -x "$DATA_BIN" ]]; then build_binaries; fi
    reset_data
    ;;
  stop)
    stop_one "$PID_DIR/app.pid" "$APP_BIN"
    stop_one "$PID_DIR/mailbox.pid" "$MAIL_BIN"
    if [[ -S "$STATE_DIR/mariadb.sock" ]]; then
      verify_database_instance
      "$MARIADB_ADMIN" --no-defaults --protocol=socket --socket="$STATE_DIR/mariadb.sock" -u"$(id -un)" shutdown >/dev/null 2>&1 || true
    fi
    stop_one "$PID_DIR/mariadb.pid" "$MARIADBD"
    echo "Acceptance services stopped. Persistent database, accounts and mailbox files were kept at $STATE_DIR."
    ;;
  *)
    echo "Usage: $0 {build|up|status|urls|reset-data|stop}" >&2
    exit 2
    ;;
esac
