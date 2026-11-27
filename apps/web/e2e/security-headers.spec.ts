import { expect, test } from '@playwright/test';

test('pages are served with the security headers, and the camera is allowed for this site only', async ({
  request,
}) => {
  const response = await request.get('/login');
  const headers = response.headers();
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  // /m/scan reads QR labels with the camera. `camera=()` would block it for this site too, so the scanner could
  // never start. Microphone and location stay off: nothing in the app uses them.
  const policy = headers['permissions-policy'] ?? '';
  expect(policy).toContain('camera=(self)');
  expect(policy).toContain('microphone=()');
  expect(policy).toContain('geolocation=()');
});
