# Deploying to Railway

One Railway service runs the whole app from this repository. `railway.json` holds the build and deploy settings, and `railpack.json` adds OpenSSL to the runtime image for Prisma:

| Step | Command | What it does |
|---|---|---|
| Build | `pnpm install --frozen-lockfile --prod=false && pnpm build` | Builds the shared packages, the API and the web app (the explicit install makes sure build tools are present even if the builder sets `NODE_ENV=production`) |
| Start | `node scripts/start.mjs` | First sets up the database as the owner (`scripts/release.mjs`): creates or updates the `cafm_app` role, applies migrations, reseeds the demo when `DEMO_MODE=true`, and checks the app role can connect. Then it runs the API on an internal port and the web app on `$PORT`; the web app proxies `/api` to the API |
| Health check | `GET /api/health` | Goes through the web app to the API, so it checks both |

## Service variables

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Owner connection. Only the database setup at start uses it; the running API never gets it |
| `APP_DB_PASSWORD` | A long random string | Password for the `cafm_app` role. Set on the role at every start, so changing it here rotates it |
| `TRUST_PROXY_HOPS` | `2` | Railway's edge plus the web app's proxy, so the API sees each visitor's real IP (needed for the sign-in rate limit) |
| `DEMO_MODE` | `true` only on the demo environment | Shows the demo accounts on the login page and reseeds demo data on each deploy. Never set on a customer environment (doc 06, risk R11) |
| `WEB_ORIGIN` | Optional | Extra allowed origins for sign-in requests; the site's own domain is always allowed |

`NODE_ENV`, `APP_DATABASE_URL`, `API_URL` and `API_PORT` are set by the start script.

## Region

Doc 04 § Hosting asks for the closest European region Railway offers. Set it under the service's Settings › Deploy › Regions (and move the Postgres service to the same region before it holds real data).

## Public access

The service is private until it has a domain: Settings › Networking › Generate domain. With `DEMO_MODE=true` anyone with the link can sign in with the demo accounts, which is the point of a demo; the demo data is reset on each deploy.
