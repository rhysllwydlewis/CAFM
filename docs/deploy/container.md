# Running the container image

The `Dockerfile` at the root builds the whole app (API, web app and worker) into one image, the same shape as the Railway service. This keeps the app portable to any container host, such as AWS ECS later (doc 04 § Hosting). CI builds it on every PR; it isn't pushed to a registry yet.

```bash
docker build -t cafm .
```

```bash
docker run --rm -p 3000:3000 \
  -e DATABASE_URL=postgresql://<owner>:<password>@<host>:5432/<database> \
  -e APP_DB_PASSWORD=<long random string> \
  -e APP_URL=https://cafm.example.com \
  cafm
```

At start, the container does the following:

1. It sets up the database as the owner: it makes sure the `cafm_app` role exists with `APP_DB_PASSWORD`, applies migrations, and seeds the demo when `DEMO_MODE=true`.
2. It checks that the app role can connect and can't bypass row-level security.
3. It then runs the API on port 4000 inside the container and the web app on `$PORT` (3000 by default). The web app proxies `/api` to the API.

The image's health check calls `/api/health` through the web app.

## Variables

The same as Railway (`docs/deploy/railway.md` § Service variables), with these differences:

- **`DATABASE_URL`:** the owner connection. The owner needs `CREATEROLE`, plus admin rights on `cafm_app` if that role already exists. It doesn't need to be a superuser, so managed databases such as RDS work.
- **`TRUST_PROXY_HOPS`:** set this to the number of proxies in front of the container, counting the web app's own proxy (for example 2 behind one load balancer).
- **`REDIS_URL`:** starts the background worker in the same container.
- **`API_PORT`:** leave it unset. The web app's `/api` proxy is fixed at build time to port 4000.

The container runs as the unprivileged `node` user.
