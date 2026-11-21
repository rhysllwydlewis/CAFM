// Production start: sets up the database (scripts/release.mjs), then runs the
// API on an internal port and the web app on $PORT in one container. The web app proxies /api to the API (same site, so
// session cookies stay first-party). If either exits, both stop so the
// platform restarts the container. The background worker restarts on its own.
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appDatabaseUrl, required } from './env.mjs';
import { release } from './release.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiPort = process.env.API_PORT ?? '4000';
const webPort = process.env.PORT ?? '3000';
const appDb = appDatabaseUrl();
if (!appDb) required('APP_DB_PASSWORD');

// Database setup runs here rather than as a separate pre-deploy step, so its
// output is in the deploy logs and the app never starts against a database
// it can't use.
try {
  await release();
} catch (err) {
  console.error('[start] database setup failed, not starting:', err.message);
  process.exit(1);
}

const env = {
  ...process.env,
  NODE_ENV: 'production',
  APP_DATABASE_URL: appDb,
  API_PORT: apiPort,
  API_URL: `http://127.0.0.1:${apiPort}`,
};
// The API never needs the owner connection.
delete env.DATABASE_URL;

// The API and web app are the service: if either exits, both stop so the platform restarts the container.
const children = [
  spawn(process.execPath, [resolve(root, 'apps/api/dist/main.js')], { env, stdio: 'inherit' }),
  spawn(resolve(root, 'apps/web/node_modules/.bin/next'), ['start', '--port', webPort, '--hostname', '0.0.0.0'], {
    cwd: resolve(root, 'apps/web'),
    env,
    stdio: 'inherit',
  }),
];

let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of [...children, worker]) child?.kill('SIGTERM');
  setTimeout(() => process.exit(code), 5000).unref();
}
for (const child of children) child.on('exit', (code) => stop(code ?? 1));
process.on('SIGTERM', () => stop(0));
process.on('SIGINT', () => stop(0));

// The background worker (outbox, scheduled jobs) needs Redis; without it the app still runs.
// It is restarted on its own if it exits, so a worker problem never takes the site down.
let worker = null;
let workerRestarts = 0;
function startWorker() {
  worker = spawn(process.execPath, [resolve(root, 'apps/worker/dist/main.js')], {
    // Only the worker, and only in demo environments, gets the owner connection: for the nightly demo reset.
    env: { ...env, ...(process.env.DEMO_MODE === 'true' ? { OWNER_DATABASE_URL: process.env.DATABASE_URL } : {}) },
    stdio: 'inherit',
  });
  const started = Date.now();
  worker.on('exit', (code) => {
    if (stopping) return;
    // Back off up to a minute; a worker that ran for a while starts again from the shortest wait.
    workerRestarts = Date.now() - started > 60_000 ? 1 : workerRestarts + 1;
    const wait = Math.min(1000 * 2 ** workerRestarts, 60_000);
    console.error(`[start] worker exited (code ${code}); restarting in ${wait / 1000}s`);
    setTimeout(startWorker, wait).unref();
  });
}
if (env.REDIS_URL) startWorker();
else console.warn('[start] REDIS_URL is not set, so the background worker is not running');
