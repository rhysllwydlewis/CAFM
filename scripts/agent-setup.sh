#!/usr/bin/env bash
# One-command setup for a fresh agent or cloud session (Claude, Codex or any
# other): starts Postgres and Redis if they're installed but not running,
# creates the local roles and database, installs dependencies, migrates,
# seeds the demo and builds the shared packages. Safe to run again.
#
#   source scripts/agent-setup.sh     # also exports the variables into your shell
#   bash scripts/agent-setup.sh       # setup only
#
# Local test credentials only, never used outside the container (CLAUDE.md).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

export DATABASE_URL=${DATABASE_URL:-postgresql://cafm:cafm@localhost:5432/cafm_dev}
export APP_DATABASE_URL=${APP_DATABASE_URL:-postgresql://cafm_app:cafm_app@localhost:5432/cafm_dev}
export REDIS_URL=${REDIS_URL:-redis://localhost:6379}
export DEMO_MODE=${DEMO_MODE:-true}
export WEB_ORIGIN=${WEB_ORIGIN:-http://localhost:3000}
export API_URL=${API_URL:-http://localhost:4000}
# The attachment API uses PostgreSQL in the local setup without a bucket or clamd.

step() { printf '\n[setup] %s\n' "$*"; }

as_postgres() {
  if [ "$(id -u)" = 0 ] && id postgres >/dev/null 2>&1; then su postgres -c "$1"; else bash -c "$1"; fi
}

step 'Postgres'
local_pg=false
if [ -x /etc/init.d/postgresql ] || id postgres >/dev/null 2>&1; then local_pg=true; fi
if ! pg_isready -q -h localhost 2>/dev/null; then
  if $local_pg && command -v service >/dev/null; then
    service postgresql start >/dev/null
  elif command -v docker >/dev/null && [ -f docker-compose.yml ]; then
    # Compose creates the roles itself (infra/postgres/init.sql) and starts Redis too.
    docker compose up -d postgres redis
    local_pg=false
  else
    echo 'Postgres 16 is not running and could not be started. Start it, then run this again.' >&2
    exit 1
  fi
  for _ in $(seq 1 30); do pg_isready -q -h localhost && break; sleep 1; done
fi
if $local_pg && command -v psql >/dev/null; then
  as_postgres "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='cafm'\" | grep -q 1 || psql -qc \"CREATE ROLE cafm LOGIN PASSWORD 'cafm' CREATEDB\""
  as_postgres "psql -tc \"SELECT 1 FROM pg_database WHERE datname='cafm_dev'\" | grep -q 1 || createdb -O cafm cafm_dev"
  as_postgres "psql -q -f infra/postgres/init.sql" >/dev/null
fi

step 'Redis'
if command -v redis-cli >/dev/null && ! redis-cli ping >/dev/null 2>&1; then
  if command -v redis-server >/dev/null; then redis-server --daemonize yes >/dev/null; fi
fi
redis-cli ping >/dev/null 2>&1 && echo 'Redis is running' || echo 'Redis is not running: the worker tests and the worker need it'

step 'Dependencies'
corepack enable >/dev/null 2>&1 || true
pnpm install --frozen-lockfile

step 'Database: migrate and seed the demo'
pnpm db:migrate
pnpm db:seed

step 'Build the shared packages'
pnpm turbo run build --filter=@fmstead/shared --filter=@fmstead/db --filter=@fmstead/config-engine >/dev/null

step 'Ready. Next: read docs/PROGRESS.md (where the build is) and CLAUDE.md (the rules).'
echo 'Checks: pnpm lint && pnpm typecheck && pnpm test   Run: pnpm dev (http://localhost:3000)'
