// Shared environment handling for the production start and release scripts.

/**
 * The API connects as the non-owner app role. On a host like Railway only the
 * owner connection (DATABASE_URL) is provided, so build APP_DATABASE_URL from
 * it with the cafm_app user and APP_DB_PASSWORD.
 */
export function appDatabaseUrl(env = process.env) {
  if (env.APP_DATABASE_URL) return env.APP_DATABASE_URL;
  if (!env.DATABASE_URL || !env.APP_DB_PASSWORD) return undefined;
  const url = new URL(env.DATABASE_URL);
  url.username = 'cafm_app';
  url.password = env.APP_DB_PASSWORD;
  return url.toString();
}

export function required(name, env = process.env) {
  const value = env[name];
  if (!value) {
    console.error(`${name} is not set. See docs/deploy/railway.md.`);
    process.exit(1);
  }
  return value;
}
