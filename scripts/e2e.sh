#!/usr/bin/env bash
# Runs the Playwright suite against a throwaway stack: its own Compose project, ports 3001/8001 and
# database volume, seeded with synthetic data and deleted afterwards. The demo stack is never touched.
# Needs Docker and SEED_TECH_PASSWORD in .env. Extra arguments go to `playwright test` (e.g. -g workflows).
set -euo pipefail
cd "$(dirname "$0")/.."

PLAYWRIGHT_IMAGE="mcr.microsoft.com/playwright:v1.64.1-noble"   # keep in step with @playwright/test in package.json
PW="$(grep -E '^SEED_TECH_PASSWORD=' .env 2>/dev/null | cut -d= -f2- || true)"
[ -n "$PW" ] || { echo "Set SEED_TECH_PASSWORD in .env (the seeded technician password)." >&2; exit 1; }
ADMIN_PW="$(grep -E '^SEED_ADMIN_PASSWORD=' .env 2>/dev/null | cut -d= -f2- || true)"   # optional: admin-only tests skip without it

compose() { docker compose -p xsupport-e2e -f docker-compose.yml -f docker-compose.e2e.yml "$@"; }
cleanup() { compose down -v --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "Starting the e2e stack (ports 3001/8001)…"
compose up -d --build --quiet-pull >/dev/null
for _ in $(seq 1 60); do curl -sf -m 3 http://localhost:8001/api/health >/dev/null && break; sleep 2; done
curl -sf -m 3 http://localhost:8001/api/health >/dev/null || { echo "Backend did not become healthy." >&2; compose logs backend | tail -30; exit 1; }
compose exec -T backend python ../scripts/seed_database.py | grep -v -i password

docker run --rm --network host --ipc=host \
  -e E2E_BASE_URL=http://localhost:3001 -e E2E_PASSWORD="$PW" -e E2E_ADMIN_PASSWORD="$ADMIN_PW" \
  -v "$PWD/frontend":/app -w /app "$PLAYWRIGHT_IMAGE" npx playwright test "$@"
