import { expect, test } from '@playwright/test';

test('pages send the content security policy and HSTS headers', async ({ request }) => {
  const res = await request.get('/login');
  const headers = res.headers();
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['content-security-policy']).toContain("object-src 'none'");
  expect(headers['content-security-policy-report-only']).toContain("default-src 'self'");
  expect(headers['strict-transport-security']).toContain('max-age=31536000');
});
