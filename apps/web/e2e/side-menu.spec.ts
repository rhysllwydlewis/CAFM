import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { createTenant, PrismaClient } from '@cafm/db';

// The collapsed choice is saved on a real person's account (the shared demo personas save none), so these tests sign in
// as a throwaway administrator in an organisation of their own. Each Playwright project gets its own, so the desktop
// and phone runs never share a choice with each other or with another spec, and every test starts and ends with the
// menu open.
const password = 'Pw-' + randomUUID();
const suffix = randomUUID().slice(0, 8);
let email = '';
let tenantId = '';
const db = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL ?? 'postgresql://cafm:cafm@localhost:5432/cafm_dev',
});

test.beforeAll(async ({ playwright }) => {
  email = `menu-${test.info().project.name}-${suffix}@test.example`;
  const tenant = await createTenant(db, {
    name: 'Side menu test estate',
    slug: `menu-${test.info().project.name}-${suffix}`,
    plan: 'professional',
    adminEmail: email,
    appUrl: 'http://localhost:3000',
  });
  tenantId = tenant.tenantId;
  const api = await playwright.request.newContext({ baseURL: test.info().project.use.baseURL });
  const accepted = await api.post('/api/auth/invites/' + tenant.inviteUrl.split('/').at(-1) + '/accept', {
    data: { name: 'Test administrator', password, acceptTerms: true },
  });
  expect(accepted.ok()).toBe(true);
  await api.dispose();
});

test.afterAll(async () => {
  const where = { tenantId };
  const account = await db.account.findUnique({ where: { email } });
  await db.$transaction(async (tx) => {
    await tx.session.deleteMany({ where });
    await tx.auditEvent.deleteMany({ where });
    await tx.invite.deleteMany({ where });
    await tx.outboxMessage.deleteMany({ where });
    await tx.membership.deleteMany({ where });
    await tx.role.deleteMany({ where });
    await tx.authEvent.deleteMany({ where: account ? { accountId: account.id } : where });
    if (account) await tx.account.delete({ where: { id: account.id } });
    await tx.tenant.delete({ where: { id: tenantId } });
  });
  await db.$disconnect();
});

async function setCollapsed(page: Page, collapsed: boolean) {
  const res = await page.request.patch('/api/auth/preferences', { data: { navCollapsed: collapsed } });
  expect(res.ok()).toBe(true);
}

async function savedChoice(page: Page) {
  return (await (await page.request.get('/api/auth/me')).json()).preferences;
}

let signedInAsPerson = false;
test.beforeEach(() => {
  signedInAsPerson = false;
});

/** Signs in and starts from an open menu, unless the test is about what a sign-in brings with it. */
async function signIn(page: Page, { reset = true } = {}) {
  signedInAsPerson = true;
  await page.goto('/login');
  await page.getByLabel('Email or username').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login/);
  if (reset) await setCollapsed(page, false);
}

async function assertAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.map((violation) => [violation.id, violation.nodes.map((node) => node.target)])).toEqual([]);
}

test.afterEach(async ({ page }) => {
  // Leave the person's menu open for the next run, whatever the test did.
  if (!signedInAsPerson) return;
  await page.request.patch('/api/auth/preferences', { data: { navCollapsed: false } }).catch(() => undefined);
});

test.describe('side menu on a desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('collapses to an icon rail, keeps the names for screen readers, and remembers the choice', async ({ page }) => {
    await signIn(page);
    await page.goto('/app');
    const menu = page.getByRole('complementary', { name: 'Main' });
    const widthOf = async () => (await menu.boundingBox())?.width ?? 0;
    await expect.poll(widthOf).toBeGreaterThan(240);

    await page.getByRole('button', { name: 'Collapse side menu' }).click();
    await expect.poll(widthOf).toBeLessThan(80);
    // The link is still named by its label, and shows it beside the rail on hover and on keyboard focus.
    const home = menu.getByRole('link', { name: 'Home', exact: true });
    await expect(home).toHaveAttribute('data-label', 'Home');
    await expect(home).toBeVisible();
    const tip = () => home.evaluate((el) => getComputedStyle(el, '::after').content);
    expect(await tip()).toBe('none');
    await home.hover();
    await expect.poll(tip).toBe('"Home"');
    await page.mouse.move(700, 400);
    await expect.poll(tip).toBe('none');
    await home.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(home).toBeFocused();
    expect(await tip()).toBe('"Home"');
    // Generated text counts towards a link's name, so while the tooltip shows the name must still be just "Home".
    await expect(menu.getByRole('link', { name: 'Home', exact: true })).toHaveCount(1);
    // Fixed, not absolute, so the menu's own scroll area cannot clip it, and just to the right of the 64px rail.
    const box = await home.evaluate((el) => {
      const style = getComputedStyle(el, '::after');
      return { position: style.position, left: style.left };
    });
    expect(box).toEqual({ position: 'fixed', left: '72px' });
    await expect(menu.getByRole('button', { name: 'Expand side menu' })).toBeVisible();
    await assertAccessible(page);

    // Still collapsed after a reload, with no flash of the full menu: the server reads the saved choice. The save is
    // sent in the background, so wait for it first.
    await expect.poll(() => savedChoice(page)).toEqual({ navCollapsed: true });
    await page.reload();
    await expect.poll(widthOf).toBeLessThan(80);

    await page.getByRole('button', { name: 'Expand side menu' }).click();
    await expect.poll(widthOf).toBeGreaterThan(240);
    await expect.poll(() => savedChoice(page)).toEqual({ navCollapsed: false });
    await page.reload();
    await expect.poll(widthOf).toBeGreaterThan(240);
  });

  test('the choice follows the person to another browser', async ({ page, browser, baseURL }) => {
    await signIn(page);
    await page.goto('/app');
    await page.getByRole('button', { name: 'Collapse side menu' }).click();
    await expect.poll(() => savedChoice(page)).toEqual({ navCollapsed: true });

    // A brand new browser with no cookies: the saved choice comes from the account.
    const other = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
    try {
      const second = await other.newPage();
      await signIn(second, { reset: false });
      await second.goto('/app');
      const width = async () => (await second.getByRole('complementary', { name: 'Main' }).boundingBox())?.width ?? 0;
      await expect.poll(width).toBeLessThan(80);
      await expect(second.getByRole('button', { name: 'Expand side menu' })).toBeVisible();

      // Opening it there is saved too, and the first browser sees that on its next load.
      await second.getByRole('button', { name: 'Expand side menu' }).click();
      await expect.poll(() => savedChoice(second)).toEqual({ navCollapsed: false });
      await page.reload();
      await expect(page.getByRole('button', { name: 'Collapse side menu' })).toBeVisible();
    } finally {
      await other.close();
    }
  });

  test('the account menu still opens from the collapsed rail', async ({ page }) => {
    await signIn(page);
    await page.goto('/app');
    await page.getByRole('button', { name: 'Collapse side menu' }).click();
    await page.getByRole('button', { name: /Account and settings/ }).click();
    await expect(page.getByRole('radiogroup', { name: 'Theme' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  });

  test('a menu longer than the window shows a glow on the edge with more beyond it', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 420 });
    await signIn(page);
    await page.goto('/app');
    const list = page.getByRole('navigation', { name: 'Modules' });
    expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    // Two covers that move with the content hide each glow at its own end; the glows stay put.
    await expect(list).toHaveCSS('background-attachment', 'local, local, scroll, scroll');
    await expect(list).toHaveCSS('background-repeat', 'no-repeat, no-repeat, no-repeat, no-repeat');
    // The same still holds after scrolling to the bottom and in the collapsed rail.
    await list.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await page.getByRole('button', { name: 'Collapse side menu' }).click();
    await expect(list).toHaveCSS('background-attachment', 'local, local, scroll, scroll');
  });

  test('a failed sign-out shows its message beside the rail, where it can be read', async ({ page }) => {
    await signIn(page);
    await page.goto('/app');
    await page.getByRole('button', { name: 'Collapse side menu' }).click();
    await page.route('**/auth/logout', (route) => route.abort());
    await page.getByRole('button', { name: 'Sign out' }).click();
    const alert = page.getByRole('alert').filter({ hasText: 'Could not sign out' });
    await expect(alert).toBeVisible();
    const rail = await page.getByRole('complementary', { name: 'Main' }).boundingBox();
    const box = await alert.boundingBox();
    // It sits on the page beside the rail, not inside the 64px rail where it would spill out.
    expect(box!.x).toBeGreaterThanOrEqual(rail!.x + rail!.width);
  });

  test('the theme buttons are one tab stop and the arrow keys move the choice', async ({ page }) => {
    await signIn(page);
    await page.goto('/app');
    await page.getByRole('button', { name: /Account and settings/ }).click();
    const group = page.getByRole('radiogroup', { name: 'Theme' });
    await expect(group.locator('[role="radio"][tabindex="0"]')).toHaveCount(1);
    await group.getByRole('radio', { name: 'Light' }).click();
    await page.keyboard.press('ArrowRight');
    await expect(group.getByRole('radio', { name: 'Dark' })).toBeFocused();
    await expect(group.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    // It wraps round to the last choice.
    await expect(group.getByRole('radio', { name: 'System' })).toBeFocused();
  });
});

test.describe('side menu on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('has no collapse button, because the menu is a drawer there', async ({ page }) => {
    await signIn(page);
    await page.goto('/app');
    await expect(page.getByRole('button', { name: 'Collapse side menu' })).toBeHidden();
  });

  test('opening the menu moves focus into it', async ({ page }) => {
    await signIn(page);
    await page.goto('/app');
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Close menu' })).toBeFocused();
  });

  test('a menu collapsed on a desktop still opens in full on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await page.goto('/app');
    await page.getByRole('button', { name: 'Collapse side menu' }).click();
    await expect(page.getByRole('button', { name: 'Expand side menu' })).toBeVisible();
    await expect.poll(() => savedChoice(page)).toEqual({ navCollapsed: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await expect(page.getByRole('complementary', { name: 'Main' }).getByText('Home', { exact: true })).toBeVisible();
  });
});

test.describe('side menu in the demo', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('the shared demo people save no choice, so it lasts only until the page is reloaded', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email or username').fill('executive@demo.example');
    await page.getByLabel('Password', { exact: true }).fill('CafmDemo!2026');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).not.toHaveURL(/\/login/);
    await page.goto('/app');

    const saves: string[] = [];
    page.on('request', (req) => req.url().includes('/auth/preferences') && saves.push(req.method()));
    await page.getByRole('button', { name: 'Collapse side menu' }).click();
    await expect(page.getByRole('button', { name: 'Expand side menu' })).toBeVisible();
    // Nothing is sent, and the API holds nothing for them, however many visitors have collapsed it before.
    expect(saves).toEqual([]);
    expect(await savedChoice(page)).toEqual({});
    // The direct API route is refused too, so a script cannot save one either.
    expect((await page.request.patch('/api/auth/preferences', { data: { navCollapsed: true } })).status()).toBe(403);

    await page.reload();
    await expect(page.getByRole('button', { name: 'Collapse side menu' })).toBeVisible();
  });
});

test.describe('side menu while viewing as someone else', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('can be collapsed for the visit, but nothing is saved on the other person’s account', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email or username').fill('superuser@demo.example');
    await page.getByLabel('Password', { exact: true }).fill('CafmDemo!2026');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).not.toHaveURL(/\/login/);
    await page.goto('/app/admin/users');
    const card = page.getByRole('region', { name: 'View as user' });
    await card.getByLabel('Person').selectOption({ label: 'Tom Price (Technician)' });
    await card.getByLabel('Reason').fill('Checking the side menu choice is not saved');
    await card.getByRole('button', { name: 'View as this person' }).focus();
    await page.keyboard.press('Enter');
    const banner = page.getByRole('status').filter({ hasText: 'You are viewing as Tom Price' });
    await expect(banner).toBeVisible();

    const saves: string[] = [];
    page.on('request', (req) => req.url().includes('/auth/preferences') && saves.push(req.method()));
    await page.getByRole('button', { name: 'Collapse side menu' }).click();
    await expect(page.getByRole('button', { name: 'Expand side menu' })).toBeVisible();
    // Read-only means no attempt is made, rather than an attempt that is refused.
    expect(saves).toEqual([]);

    await banner.getByRole('button', { name: 'Stop viewing' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'You are viewing as' })).toHaveCount(0);
  });
});
