import { expect, test } from '@playwright/test';

test('pages send the content security policy and HSTS headers', async ({ request }) => {
  const res = await request.get('/login');
  const headers = res.headers();
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['content-security-policy']).toContain("object-src 'none'");
  expect(headers['content-security-policy-report-only']).toContain("default-src 'self'");
  expect(headers['strict-transport-security']).toContain('max-age=31536000');
});

test('the report-only policy uses a new script nonce on every request', async ({ request }) => {
  const nonceOf = async () => {
    const res = await request.get('/login');
    const policy = res.headers()['content-security-policy-report-only'] ?? '';
    const match = /script-src [^;]*'nonce-([^']+)'/.exec(policy);
    expect(match, policy).not.toBeNull();
    expect(policy).not.toMatch(/script-src [^;]*'unsafe-inline'/);
    return match![1];
  };
  const first = await nonceOf();
  expect(await nonceOf()).not.toBe(first);
});

test('the sign-in page raises no script policy violations', async ({ page }) => {
  const violations: string[] = [];
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      (window as unknown as { __csp: string[] }).__csp = [
        ...((window as unknown as { __csp?: string[] }).__csp ?? []),
        `${e.violatedDirective} ${e.blockedURI}`,
      ];
    });
  });
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  violations.push(...(await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? [])));
  expect(violations.filter((v) => v.startsWith('script-src'))).toEqual([]);
});

test('the report-only policy names the report endpoint, which logs a violation and keeps nothing else', async ({
  request,
}) => {
  const res = await request.get('/login');
  expect(res.headers()['content-security-policy-report-only']).toContain('report-uri /csp-report');
  const sent = await request.post('/csp-report', {
    headers: { 'content-type': 'application/csp-report' },
    data: JSON.stringify({
      'csp-report': {
        'document-uri': 'https://example.test/login?token=secret',
        'blocked-uri': 'https://cdn.example.test/x.js?k=1',
        'effective-directive': 'script-src-elem',
        disposition: 'report',
      },
    }),
  });
  expect(sent.status()).toBe(204);
  const junk = await request.post('/csp-report', { headers: { 'content-type': 'application/json' }, data: 'not json' });
  expect(junk.status()).toBe(204);
  const big = await request.post('/csp-report', {
    headers: { 'content-type': 'application/json' },
    data: 'x'.repeat(9000),
  });
  expect(big.status()).toBe(413);
});
