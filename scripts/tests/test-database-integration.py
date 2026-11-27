#!/usr/bin/env python3
"""Run the synthetic MariaDB suite without silently skipping database tests.

Requires a disposable database at the same loopback address enforced by the
existing acceptance tests. Real student timetable fixtures are deliberately not
part of this synthetic suite. Never points at production or resets a database.
"""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "internal/backend"
dsn = os.environ.get("TARSGO_QA_TEST_DSN", "")
match = re.fullmatch(r"([^:@]+):([^@]+)@tcp\(127\.0\.0\.1:3317\)/tarsgo_acceptance\?charset=utf8mb4&parseTime=true&loc=UTC", dsn)
if not match:
    sys.exit("Set TARSGO_QA_TEST_DSN to the isolated loopback tarsgo_acceptance database (3317), with charset=utf8mb4&parseTime=true&loc=UTC.")
if os.environ.get("TARSGO_INTEGRATION_MYSQL_DSN", dsn) != dsn:
    sys.exit("Both integration DSNs must refer to the same isolated database.")

env = dict(os.environ, TZ="UTC", TARSGO_INTEGRATION_MYSQL_DSN=dsn,
           APP_ENV="acceptance", APP_HOST="127.0.0.1", APP_PORT="8182",
           EMAIL_API_URL="http://127.0.0.1:8126/emails", TARSGO_ACCEPTANCE_SEED="true",
           TARSGO_TEST_USER_PASSWORD="synthetic-user-only",
           TARSGO_TEST_ADMIN_PASSWORD="synthetic-admin-only",
           TARSGO_TEST_SUPER_ADMIN_PASSWORD="synthetic-super-only", APP_AUTO_MIGRATE="false", DB_HOST="127.0.0.1",
           DB_PORT="3317", DB_NAME="tarsgo_acceptance", DB_USER=match[1],
           DB_PASSWORD=match[2], DB_LOC="UTC", JWT_SECRET="isolated-synthetic-test-secret-not-for-production")
# First run covers an empty CI database; second proves the registry can re-run.
for _ in range(2):
    subprocess.run(["go", "run", "./cmd/migrate"], cwd=BACKEND, env=env, check=True)

pattern = "^(TestAcceptanceDatabase|TestMariaDB|TestWeeklyReportAllMemberAndGroupScopeAcceptance)"
# Serial packages avoid collisions between historical migration fixtures and
# other tests sharing this disposable schema. Disable Go's result cache.
result = subprocess.run(["go", "test", "-json", "-count=1", "-p=1", "-run", pattern, "./..."],
                        cwd=BACKEND, env=env, text=True, stdout=subprocess.PIPE)
passed, skipped = set(), []
for line in result.stdout.splitlines():
    event = json.loads(line)
    if event.get("Action") == "output":
        print(event.get("Output", ""), end="")
    if event.get("Test") and event["Action"] == "pass":
        passed.add((event["Package"], event["Test"]))
    if event.get("Test") and event["Action"] == "skip":
        skipped.append((event["Package"], event["Test"]))
if result.returncode or skipped or not passed:
    sys.exit(f"Database suite failed: exit={result.returncode}, skipped={skipped}, passed={len(passed)}")
print(f"Database suite passed: {len(passed)} tests/subtests, zero skips.")

if any(os.environ.get(flag) == "true" for flag in (
        "TARSGO_PIXEL_BROWSER_ACCEPTANCE", "TARSGO_RMUC_BROWSER_ACCEPTANCE")):
    subprocess.run(["make", "build"], cwd=ROOT, env=env, check=True)
    server = subprocess.Popen([ROOT / "dist/tarsgo-backend"], cwd=ROOT, env=env)
    try:
        for attempt in range(30):
            if server.poll() is not None:
                sys.exit("Isolated browser acceptance server stopped before startup")
            try:
                with urlopen("http://127.0.0.1:8182/healthz", timeout=2) as response:
                    if response.status == 200:
                        break
            except OSError:
                time.sleep(1)
        else:
            sys.exit("Isolated browser acceptance server did not become ready")
        subprocess.run(["node", "scripts/tests/test-pixel-fishing-browser.mjs"], cwd=ROOT,
                       env=env, check=True, timeout=480)
    finally:
        server.terminate()
        server.wait(timeout=15)
