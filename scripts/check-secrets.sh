#!/usr/bin/env bash
set -euo pipefail

# Lightweight guard for CI/pre-commit. Review matches manually; this intentionally
# avoids printing the matched secret contents.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
if rg -l --hidden --glob '!.git/**' --glob '!*.lock' \
  '(client_secret\s*[:=]\s*[^<\s][^\s]{12,}|password\s*[:=]\s*[^<\s][^\s]{8,})' \
  doc internal/backend --glob '*.md' --glob '*.env' --glob '!*.env.example'; then
  echo "Potential credential found. Remove it and rotate the credential before committing." >&2
  exit 1
fi
echo "No obvious credentials found."
