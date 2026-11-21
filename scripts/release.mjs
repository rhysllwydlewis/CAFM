// Database setup, run as the owner (DATABASE_URL) before the app starts:
// 1. makes sure the app role exists with the current APP_DB_PASSWORD,
// 2. applies migrations,
// 3. resets the demo data when DEMO_MODE=true,
// 4. checks the app role can actually connect.
// Called by scripts/start.mjs on every start; also runnable on its own.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appDatabaseUrl, required } from './env.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dbDir = resolve(root, 'packages/db');
const require = createRequire(resolve(dbDir, 'package.json'));

function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit', env: process.env });
  if (result.status !== 0) throw new Error(`${args.join(' ')} failed (exit ${result.status})`);
}

/** Host and database only: never log credentials. */
function describe(url) {
  const u = new URL(url);
  return `${u.username}@${u.host}${u.pathname}`;
}

export async function release() {
  const ownerUrl = required('DATABASE_URL');
  const appPassword = required('APP_DB_PASSWORD');
  const { PrismaClient } = require('@prisma/client');

  console.log(`[release] owner connection: ${describe(ownerUrl)}`);
  const db = new PrismaClient({ datasourceUrl: ownerUrl });
  try {
    await db.$executeRawUnsafe(`DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cafm_app') THEN
    CREATE ROLE cafm_app LOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
END
$$;`);
    // format(%L) quotes the password safely; it is never interpolated into SQL here.
    const [{ sql }] =
      await db.$queryRaw`SELECT format('ALTER ROLE cafm_app WITH LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD %L', ${appPassword}) AS sql`;
    await db.$executeRawUnsafe(sql);
    console.log('[release] app role cafm_app is ready');
  } finally {
    await db.$disconnect();
  }

  run(resolve(dbDir, 'node_modules/.bin/prisma'), ['migrate', 'deploy'], dbDir);

  if (process.env.DEMO_MODE === 'true') {
    run(process.execPath, [resolve(dbDir, 'dist/seed.js')], dbDir);
  } else {
    console.log('[release] DEMO_MODE is not true, so demo data was not seeded');
  }

  const appUrl = appDatabaseUrl();
  console.log(`[release] checking app connection: ${describe(appUrl)}`);
  const app = new PrismaClient({ datasourceUrl: appUrl });
  try {
    const [{ user, bypass }] =
      await app.$queryRaw`SELECT current_user AS user, rolbypassrls AS bypass FROM pg_roles WHERE rolname = current_user`;
    if (bypass) throw new Error(`${user} can bypass row-level security`);
    console.log(`[release] app connects as ${user}, row-level security applies`);
  } finally {
    await app.$disconnect();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  release().catch((err) => {
    console.error('[release] failed:', err.message);
    process.exit(1);
  });
}
