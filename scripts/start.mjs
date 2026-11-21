// Production start: runs the API on an internal port and the web app on $PORT
// in one container. The web app proxies /api to the API (same site, so
// session cookies stay first-party). If either process exits, both stop so
// the platform restarts the container.
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appDatabaseUrl, required } from './env.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiPort = process.env.API_PORT ?? '4000';
const webPort = process.env.PORT ?? '3000';
const appDb = appDatabaseUrl();
if (!appDb) required('APP_DB_PASSWORD');

const env = {
  ...process.env,
  NODE_ENV: 'production',
  APP_DATABASE_URL: appDb,
  API_PORT: apiPort,
  API_URL: `http://127.0.0.1:${apiPort}`,
};
// The API never needs the owner connection.
delete env.DATABASE_URL;

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
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 5000).unref();
}
for (const child of children) child.on('exit', (code) => stop(code ?? 1));
process.on('SIGTERM', () => stop(0));
process.on('SIGINT', () => stop(0));
