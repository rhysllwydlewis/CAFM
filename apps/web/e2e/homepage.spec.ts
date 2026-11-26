import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** Scroll to a point in the film, measured in screen heights. */
async function scrollFilm(page: Page, screens: number) {
  await expect(page.locator('[data-film="on"]')).toHaveCount(1);
  await page.evaluate((n) => {
    const stage = document.querySelector<HTMLElement>('[data-film-stage]');
    window.scrollTo(0, n * (stage?.clientHeight ?? window.innerHeight));
  }, screens);
}

const caption = (page: Page, id: string) => page.locator(`[data-caption="${id}"]`);
const stage = (page: Page) => page.locator('[data-film-stage]');

test('the opening says what FM Stead is and offers the demo and sign in', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'One day at Cardiff HQ.' })).toBeVisible();
  const intro = page.locator('[data-intro]');
  await expect(intro.getByText('FM Stead runs the helpdesk, work orders, planned maintenance')).toBeVisible();
  await expect(intro.getByRole('link', { name: 'Try the demo' })).toHaveAttribute('href', '/login#demo-heading');
  await expect(intro.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute('href', '/login');
  await expect(page.locator('[data-time]')).toHaveText('05:00');
});

test('scrolling runs the clock through the day, and the log keeps up', async ({ page }) => {
  await page.goto('/');
  await scrollFilm(page, 3);
  await expect(page.locator('[data-time]')).toHaveText(/^1[01]:\d\d$/);
  await expect(page.locator('[data-hour][data-state="on"]')).toContainText('WO-10413 completed');
  await expect(stage(page)).toHaveAttribute('data-scene', '0');
  await expect(page.locator('[data-caption][data-state="on"]')).toHaveCount(0);

  await scrollFilm(page, 6.5);
  await expect(page.locator('[data-hour][data-state="on"]')).toContainText('Boiler 2 losing pressure');
});

test('at 18:00 the evening plays forwards and backwards, one caption at a time', async ({ page }) => {
  await page.goto('/');
  await scrollFilm(page, 7.9);
  await expect(stage(page)).toHaveAttribute('data-scene', '1');
  await expect(caption(page, '1')).toHaveAttribute('data-state', 'on');
  await expect(page.locator('[data-corner]')).toHaveText(/^(18|19):\d\d$/);

  // Mid-handover, no caption is up.
  await scrollFilm(page, 8.75);
  await expect(page.locator('[data-caption][data-state="on"]')).toHaveCount(0);

  // The plant room: the job is raised, then closed.
  await scrollFilm(page, 9.6);
  await expect(stage(page)).toHaveAttribute('data-scene', '2');
  await expect(caption(page, '2')).toHaveAttribute('data-state', 'on');
  await scrollFilm(page, 10.6);
  await expect(caption(page, '2b')).toHaveAttribute('data-state', 'on');
  await expect(caption(page, '2')).toHaveAttribute('data-state', 'past');

  await scrollFilm(page, 3);
  await expect(stage(page)).toHaveAttribute('data-scene', '0');
  await expect(page.locator('[data-caption][data-state="on"]')).toHaveCount(0);
  await expect(caption(page, '1')).toHaveAttribute('data-state', 'next');
});

test('the opening buttons leave the tab order once the day starts', async ({ page }) => {
  await page.goto('/');
  const actions = page.locator('[data-hero-actions]');
  await expect(page.locator('[data-film="on"]')).toHaveCount(1);
  await expect(actions).toHaveJSProperty('inert', false);
  await scrollFilm(page, 1);
  await expect(actions).toHaveJSProperty('inert', true);
  await scrollFilm(page, 0);
  await expect(actions).toHaveJSProperty('inert', false);
});

test('the film ends on paper with the demo and sign-in links', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-film="on"]')).toHaveCount(1);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const final = page.getByRole('region', { name: 'Every day. Every building.' });
  await expect(final.getByRole('heading', { name: 'Every day. Every building.' })).toBeInViewport();
  await expect(page.locator('main')).toHaveAttribute('data-world', 'paper');
  await expect(final.getByRole('link', { name: 'Try the demo' })).toHaveAttribute('href', '/login#demo-heading');
  await expect(final.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute('href', '/login');
  await expect(final.getByRole('list', { name: 'In FM Stead' }).getByRole('listitem')).toHaveCount(5);
});

test('with reduced motion at 320px the film steps between frames and fits the screen', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await expect(page.locator('[data-intro]')).toHaveAttribute('data-state', 'on');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(axe.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map((node) => node.target) }))).toEqual([]);

  await scrollFilm(page, 9.6);
  await expect(stage(page)).toHaveAttribute('data-scene', '2');
  await expect(caption(page, '2')).toHaveAttribute('data-state', 'on');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});

test('the skip link jumps past the film', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to the demo' });
  await expect(skip).toBeFocused();
  await skip.press('Enter');
  await expect(page).toHaveURL(/\/#start$/);
  await expect(page.getByRole('heading', { name: 'Every day. Every building.' })).toBeInViewport();
});

test('a link to the closing section lands on it once the film has its length', async ({ page }) => {
  await page.goto('/#start');
  await expect(page.locator('[data-film="on"]')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Every day. Every building.' })).toBeInViewport();
});

test('without JavaScript the homepage shows the opening words and its links', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'One day at Cardiff HQ.' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Floor by floor.' })).toBeHidden();
    await expect(page.locator('[data-intro]').getByRole('link', { name: 'Try the demo' })).toHaveAttribute(
      'href',
      '/login#demo-heading',
    );
    await page.getByRole('link', { name: 'Skip to the demo' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Every day. Every building.' })).toBeInViewport();
  } finally {
    await context.close();
  }
});
