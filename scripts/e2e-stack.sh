#!/usr/bin/env bash
# Starts the end-to-end stack locally: a dedicated database, the API in test mode and the web app
# built against it with test hooks. Used by `make e2e` and CI. Stop it with scripts/e2e-stack.sh stop.
set -euo pipefail
cd "$(dirname "$0")/.."

export E2E_API_PORT="${E2E_API_PORT:-5100}"
export E2E_WEB_PORT="${E2E_WEB_PORT:-4300}"
export E2E_DATABASE_URL="${E2E_DATABASE_URL:-postgresql://zproo:zproo@localhost:5432/zproo_e2e}"
export E2E_REDIS_URL="${E2E_REDIS_URL:-redis://localhost:6379/5}"
RUN_DIR="${E2E_RUN_DIR:-tests/e2e/.run}"
mkdir -p "$RUN_DIR"

stop() {
  for f in "$RUN_DIR"/*.pid; do
    # The whole process group (npx → node), so nothing keeps the ports.
    [ -f "$f" ] && { pkill -P "$(cat "$f")" 2>/dev/null; kill "$(cat "$f")" 2>/dev/null; } || true
    rm -f "$f"
  done
  for port in "$E2E_API_PORT" "$E2E_WEB_PORT"; do
    fuser -k "$port/tcp" >/dev/null 2>&1 || true
  done
}
if [ "${1:-}" = "stop" ]; then stop; exit 0; fi
stop

# The API in test mode: mock suppliers, OTP 123456, /api/test routes, X-Test-Now, scenarios.
# Per-IP limits are raised (every browser shares 127.0.0.1); per-account limits stay as in production.
api_env=(
  NODE_ENV=test ALLOW_TEST_OTP=true PORT="$E2E_API_PORT" TRUST_PROXY=1
  DATABASE_URL="$E2E_DATABASE_URL" DIRECT_DATABASE_URL="$E2E_DATABASE_URL" REDIS_URL="$E2E_REDIS_URL"
  FRONTEND_URL="http://localhost:$E2E_WEB_PORT" CORS_ORIGINS="http://localhost:$E2E_WEB_PORT"
  RATE_LIMIT_MAX=100000 AUTH_IP_RATE_LIMIT=100000 OTP_IP_RATE_LIMIT=100000 SEARCH_RATE_LIMIT=600
  JWT_SECRET=e2e-access-secret-0123456789abcdef JWT_REFRESH_SECRET=e2e-refresh-secret-0123456789abcdef
  LOG_LEVEL="${LOG_LEVEL:-info}"
)

if [ "${SKIP_DB_SETUP:-}" != "1" ]; then
  psql "${E2E_DATABASE_URL%/*}/postgres" -tc "SELECT 1 FROM pg_database WHERE datname='zproo_e2e'" | grep -q 1 \
    || psql "${E2E_DATABASE_URL%/*}/postgres" -c "CREATE DATABASE zproo_e2e"
  env DATABASE_URL="$E2E_DATABASE_URL" DIRECT_DATABASE_URL="$E2E_DATABASE_URL" npx prisma migrate deploy >/dev/null
  env DATABASE_URL="$E2E_DATABASE_URL" DIRECT_DATABASE_URL="$E2E_DATABASE_URL" npx prisma db seed >/dev/null
fi

if [ "${SKIP_WEB_BUILD:-}" != "1" ]; then
  (cd apps/web && VITE_DATA_SOURCE=api VITE_TEST_HOOKS=true VITE_API_URL= \
    npx vite build --outDir dist-e2e --emptyOutDir >/dev/null)
fi

nohup env -C apps/api "${api_env[@]}" npx tsx src/server.ts >"$RUN_DIR/api.log" 2>&1 </dev/null &
echo $! >"$RUN_DIR/api.pid"
nohup env -C apps/web API_PROXY_TARGET="http://localhost:$E2E_API_PORT" npx vite preview \
  --outDir dist-e2e --port "$E2E_WEB_PORT" --strictPort >"$RUN_DIR/web.log" 2>&1 </dev/null &
echo $! >"$RUN_DIR/web.pid"

for _ in $(seq 1 60); do
  if curl -sf "http://localhost:$E2E_WEB_PORT/api/health/ready" >/dev/null; then
    curl -sf -X POST "http://localhost:$E2E_API_PORT/api/test/reset" >/dev/null
    echo "E2E stack ready: web http://localhost:$E2E_WEB_PORT, API http://localhost:$E2E_API_PORT"
    exit 0
  fi
  sleep 1
done
echo "E2E stack did not become ready; see $RUN_DIR/*.log" >&2
exit 1
