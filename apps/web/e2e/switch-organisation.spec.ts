import { expect, test, type APIRequestContext } from '@playwright/test';
import { PrismaClient } from '@fmstead/db';

const owner = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL ?? 'postgresql://cafm:cafm@localhost:5432/cafm_dev',
});
const email = `switch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.example`;
const password = `Pw-${crypto.randomUUID()}`;

async function inviteToken(to: string): Promise<string> {
  const msg = await owner.outboxMessage.findFirst({
    where: { topic: 'email.send', payload: { path: ['to'], equals: to } },
    orderBy: { createdAt: 'desc' },
  });
  const match = (msg?.payload as { text?: string } | undefined)?.text?.match(/\/accept-invite\/([A-Za-z0-9_-]+)/);
  if (!match) throw new Error('No invite email');
  return match[1]!;
}

async function inviteAs(request: APIRequestContext, persona: string) {
  const login = await request.post('/api/auth/login', {
    data: { identifier: `${persona}@demo.example`, password: 'FmsDemo!2026' },
  });
  expect(login.ok()).toBe(true);
  expect((await request.post('/api/people/invites', { data: { email, role: 'requester' } })).status()).toBe(201);
  await request.post('/api/auth/logout', { data: {} });
}

test.afterAll(async () => {
  const account = await owner.account.findUnique({ where: { email } });
  if (account) {
    await owner.session.deleteMany({ where: { accountId: account.id } });
    await owner.authEvent.deleteMany({ where: { accountId: account.id } });
    await owner.membership.deleteMany({ where: { accountId: account.id } });
    await owner.account.delete({ where: { id: account.id } });
  }
  await owner.$disconnect();
});

test('someone in two organisations switches between them from the user menu', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Covered on desktop; the menu is the same component on a phone');
  // Invited to Demo Estates (new account), then to Starter Demo (existing account, signed in).
  await inviteAs(page.request, 'superuser');
  const first = await inviteToken(email);
  expect(
    (
      await page.request.post(`/api/auth/invites/${first}/accept`, {
        data: { name: 'Sky Switcher', password, acceptTerms: true },
      })
    ).ok(),
  ).toBe(true);
  await page.request.post('/api/auth/logout', { data: {} });
  await inviteAs(page.request, 'starter');
  const second = await inviteToken(email);
  await page.request.post('/api/auth/login', { data: { identifier: email, password } });
  expect((await page.request.post(`/api/auth/invites/${second}/accept`, { data: { acceptTerms: true } })).ok()).toBe(
    true,
  );

  await page.goto('/app');
  await expect(page.locator('.crumbs')).toContainText('Starter Demo Ltd');
  await page.getByRole('button', { name: /^Account and settings/ }).click();
  const orgs = page.getByRole('group', { name: 'Organisation' });
  await expect(orgs.getByRole('button')).toHaveCount(2);
  await orgs.getByRole('button', { name: /Demo Estates Ltd/ }).click();
  await expect(page.locator('.crumbs')).toContainText('Demo Estates Ltd');
});
