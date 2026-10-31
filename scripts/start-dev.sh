#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/internal/backend"
cd "$ROOT_DIR"
if ! command -v go >/dev/null 2>&1; then
  echo "Cannot start TarsGo: Go is required to run the backend." >&2
  exit 127
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "Cannot start TarsGo: Docker Compose v2 is required to start the local database." >&2
  exit 127
fi
if [[ ! -f internal/backend/.env ]]; then
  cp internal/backend/.env.example internal/backend/.env
  echo "Created internal/backend/.env from .env.example; review credentials before continuing."
fi
"$ROOT_DIR/scripts/start-db.sh"

BACKEND_PORT="$(sed -n 's/^APP_PORT=//p' "$BACKEND_DIR/.env" | tail -n1 | tr -d '"' | tr -d '\r')"
BACKEND_PORT="${BACKEND_PORT:-8080}"

if command -v lsof >/dev/null 2>&1; then
  mapfile_supported=false
  if [[ -n "${BASH_VERSION:-}" ]] && (( BASH_VERSINFO[0] >= 4 )); then
    mapfile_supported=true
  fi

  LISTENER_OUTPUT="$(lsof -nP -t -iTCP:"$BACKEND_PORT" -sTCP:LISTEN 2>/dev/null | sort -u || true)"
  LISTENER_PIDS=()
  if [[ -n "$LISTENER_OUTPUT" ]]; then
    if [[ "$mapfile_supported" == true ]]; then
      mapfile -t LISTENER_PIDS <<< "$LISTENER_OUTPUT"
    else
      while IFS= read -r listener_pid; do
        [[ -n "$listener_pid" ]] && LISTENER_PIDS+=("$listener_pid")
      done <<< "$LISTENER_OUTPUT"
    fi
  fi

  if (( ${#LISTENER_PIDS[@]} > 0 )); then
    for listener_pid in "${LISTENER_PIDS[@]}"; do
      listener_cwd="$(lsof -a -p "$listener_pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')"
      if [[ "$listener_cwd" != "$BACKEND_DIR" ]]; then
        listener_command="$(ps -p "$listener_pid" -o command= 2>/dev/null || true)"
        echo "Cannot start TarsGo backend: port $BACKEND_PORT is used by PID $listener_pid${listener_command:+ ($listener_command)}." >&2
        echo "Stop that process or change APP_PORT in internal/backend/.env." >&2
        exit 1
      fi
    done

    for listener_pid in "${LISTENER_PIDS[@]}"; do
      echo "Stopping existing TarsGo backend on port $BACKEND_PORT (PID $listener_pid)..."
      kill "$listener_pid"
    done
  fi

  for _ in {1..50}; do
    if ! lsof -nP -t -iTCP:"$BACKEND_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
      break
    fi
    sleep 0.1
  done

  if lsof -nP -t -iTCP:"$BACKEND_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Existing TarsGo backend did not stop; port $BACKEND_PORT is still occupied." >&2
    exit 1
  fi
fi

exec go -C internal/backend run ./cmd/server
