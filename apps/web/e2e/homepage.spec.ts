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

const caption = (page: Page, index: number) => page.locator(`[data-caption="${index}"]`);

test('the opening frame offers the demo and sign in', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Run every building.' })).toBeVisible();
  const hero = caption(page, 0);
  await expect(hero.getByRole('link', { name: 'Try the demo' })).toHaveAttribute('href', '/login#demo-heading');
  await expect(hero.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute('href', '/login');
  await expect(page.locator('[data-film-stage]')).toHaveAttribute('data-scene', '0');
});

test('scrolling plays the film forwards and backwards, one caption at a time', async ({ page }) => {
  await page.goto('/');
  const stage = page.locator('[data-film-stage]');
  await expect(caption(page, 0)).toHaveAttribute('data-state', 'on');

  await scrollFilm(page, 2.2);
  await expect(stage).toHaveAttribute('data-scene', '1');
  await expect(caption(page, 1)).toHaveAttribute('data-state', 'on');
  await expect(caption(page, 0)).toHaveAttribute('data-state', 'past');
  await expect(page.locator('[data-film-stage] [data-counter]')).toHaveText('02');

  await scrollFilm(page, 3.9);
  await expect(stage).toHaveAttribute('data-scene', '2');
  await expect(caption(page, 2)).toHaveAttribute('data-state', 'on');

  // Mid-handover, no caption is up.
  await scrollFilm(page, 4.7);
  await expect(page.locator('[data-caption][data-state="on"]')).toHaveCount(0);

  await scrollFilm(page, 0.3);
  await expect(stage).toHaveAttribute('data-scene', '0');
  await expect(caption(page, 0)).toHaveAttribute('data-state', 'on');
  await expect(caption(page, 2)).toHaveAttribute('data-state', 'next');
});

test('the opening buttons leave the tab order once the film moves on', async ({ page }) => {
  await page.goto('/');
  const actions = page.locator('[data-hero-actions]');
  await expect(caption(page, 0)).toHaveAttribute('data-state', 'on');
  await expect(actions).toHaveJSProperty('inert', false);
  await scrollFilm(page, 2.2);
  await expect(actions).toHaveJSProperty('inert', true);
  await scrollFilm(page, 0);
  await expect(actions).toHaveJSProperty('inert', false);
});

test('the film ends on paper with the demo and sign-in links', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-film="on"]')).toHaveCount(1);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const final = page.getByRole('region', { name: 'See it for yourself.' });
  await expect(final.getByRole('heading', { name: 'See it for yourself.' })).toBeInViewport();
  await expect(page.locator('main')).toHaveAttribute('data-world', 'paper');
  await expect(final.getByRole('link', { name: 'Try the demo' })).toHaveAttribute('href', '/login#demo-heading');
  await expect(final.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute('href', '/login');
  await expect(final.getByRole('list', { name: 'In CAFM' }).getByRole('listitem')).toHaveCount(5);
});

test('with reduced motion at 320px the film steps between frames and fits the screen', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await expect(caption(page, 0)).toHaveAttribute('data-state', 'on');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(axe.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map((node) => node.target) }))).toEqual([]);

  await scrollFilm(page, 5.5);
  await expect(page.locator('[data-film-stage]')).toHaveAttribute('data-scene', '3');
  await expect(caption(page, 3)).toHaveAttribute('data-state', 'on');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});

test('the skip link jumps past the film', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to the demo' });
  await expect(skip).toBeFocused();
  await skip.press('Enter');
  await expect(page).toHaveURL(/\/#start$/);
  await expect(page.getByRole('heading', { name: 'See it for yourself.' })).toBeInViewport();
});

test('a link to the closing section lands on it once the film has its length', async ({ page }) => {
  await page.goto('/#start');
  await expect(page.locator('[data-film="on"]')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'See it for yourself.' })).toBeInViewport();
});

test('without JavaScript the homepage shows the opening words and its links', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Run every building.' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Floor by floor.' })).toBeHidden();
    await expect(caption(page, 0).getByRole('link', { name: 'Try the demo' })).toHaveAttribute(
      'href',
      '/login#demo-heading',
    );
    await page.getByRole('link', { name: 'Skip to the demo' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'See it for yourself.' })).toBeInViewport();
  } finally {
    await context.close();
  }
});
