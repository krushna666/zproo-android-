#!/usr/bin/env bash
# Runs the Selenium suite against a running E2E stack (scripts/e2e-stack.sh).
# Usage: scripts/e2e-run.sh [pytest args...]   e.g. scripts/e2e-run.sh tests/e2e/test_auth.py -n 4
set -euo pipefail
cd "$(dirname "$0")/.."
PY="${E2E_PYTHON:-python3}"
export E2E_WEB_URL="${E2E_WEB_URL:-http://localhost:${E2E_WEB_PORT:-4300}}"
export E2E_API_URL="${E2E_API_URL:-http://localhost:${E2E_API_PORT:-5100}}"
# time.sleep is forbidden in the suite: explicit waits only.
if grep -rn "time\.sleep\|from time import sleep" tests/e2e tests/security --include=*.py; then
  echo "time.sleep found in tests: use WebDriverWait" >&2
  exit 1
fi
exec "$PY" -m pytest -c tests/pytest.ini --rootdir . "$@"
