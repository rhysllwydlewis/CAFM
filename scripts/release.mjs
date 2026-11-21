// Runs before each deploy (Railway pre-deploy command), as the database owner:
// 1. makes sure the app role exists with the current APP_DB_PASSWORD,
// 2. applies migrations,
// 3. resets the demo data when DEMO_MODE=true.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { required } from './env.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dbDir = resolve(root, 'packages/db');
const require = createRequire(resolve(dbDir, 'package.json'));

required('DATABASE_URL');
const appPassword = required('APP_DB_PASSWORD');

const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
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
  console.log('App database role is ready');
} finally {
  await db.$disconnect();
}

function run(cmd, args, cwd) {
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit', env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(resolve(dbDir, 'node_modules/.bin/prisma'), ['migrate', 'deploy'], dbDir);

if (process.env.DEMO_MODE === 'true') {
  run(process.execPath, [resolve(dbDir, 'dist/seed.js')], dbDir);
} else {
  console.log('DEMO_MODE is not true, so demo data was not seeded');
}
