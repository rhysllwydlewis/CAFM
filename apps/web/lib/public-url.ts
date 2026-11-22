import 'server-only';

/**
 * The address people reach this app at, when the deployment says so. Printed QR labels last for years,
 * so they should carry this rather than whatever address the manager happened to print from.
 */
export function configuredAppUrl(): string | undefined {
  const { APP_URL, RAILWAY_PUBLIC_DOMAIN } = process.env;
  const url = APP_URL || (RAILWAY_PUBLIC_DOMAIN ? `https://${RAILWAY_PUBLIC_DOMAIN}` : '');
  return url ? url.replace(/\/$/, '') : undefined;
}
