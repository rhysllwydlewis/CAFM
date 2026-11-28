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
