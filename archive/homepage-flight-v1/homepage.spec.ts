import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** Scroll to a point in the film, as a share of its length. */
async function scrollFilm(page: Page, share: number) {
  await expect(page.locator('[data-film="on"]')).toHaveCount(1);
  await page.evaluate((s) => {
    const film = document.querySelector<HTMLElement>('[data-film="on"]')!;
    window.scrollTo(0, s * (film.offsetHeight - window.innerHeight));
  }, share);
}

// A headline is two block lines with no space between them in the text, so match the words with optional space.
const chapter = (page: Page, text: string) =>
  page.locator('[data-chapter]').filter({ hasText: new RegExp(text.replace(/[.,]/g, '\\$&').replace(/ /g, '\\s*')) });
const tag = (page: Page, text: string) => page.locator('[data-tag]').filter({ hasText: text });
const altitude = (page: Page) => page.locator('[data-altitude-number]');

test('the opening says what FM Stead is and offers the demo and sign in', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Run every building.' })).toBeVisible();
  const hero = page.locator('[data-hero]');
  await expect(hero.getByText('Facilities management software.')).toBeVisible();
  await expect(hero.getByRole('link', { name: 'Try the demo' })).toHaveAttribute('href', '/login#demo-heading');
  await expect(hero.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute('href', '/login');
  await expect(altitude(page)).toHaveText('0');
});

test('the logo is the product wordmark, as everywhere else', async ({ page }) => {
  await page.goto('/');
  const logo = page.locator('header').getByRole('img', { name: 'FM Stead' });
  await expect(logo).toBeVisible();
  await expect(logo).toHaveAttribute('viewBox', '-7.07 23.36 303.17 65.57');
  await expect(page.locator('header').getByRole('link', { name: 'FM Stead, back to the top' })).toHaveAttribute(
    'href',
    '#top',
  );
});

test('scrolling flies the camera: the altitude climbs and each chapter and callout appears in turn', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('[data-loader][data-done]')).toHaveCount(1);

  // Up the facade, past the technician.
  await scrollFilm(page, 1 / 6);
  await expect(chapter(page, 'Every asset.')).toHaveAttribute('data-on', 'true');
  await expect(tag(page, 'Facade clean')).toHaveAttribute('data-on', 'true');
  await expect(altitude(page)).toHaveText('118');
  await expect(page.locator('[data-hero]')).toHaveAttribute('data-on', 'false');

  // On the roof.
  await scrollFilm(page, 2 / 6);
  await expect(chapter(page, 'Planned, not reactive.')).toHaveAttribute('data-on', 'true');
  await expect(tag(page, 'Chiller 2')).toHaveAttribute('data-on', 'true');
  await expect(tag(page, 'Solar array')).toHaveAttribute('data-on', 'true');
  await expect(chapter(page, 'Every asset.')).toHaveAttribute('data-on', 'false');

  // Over the estate.
  await scrollFilm(page, 4 / 6);
  await expect(chapter(page, 'Twelve sites. One login.')).toHaveAttribute('data-on', 'true');
  await expect(tag(page, 'Head office')).toHaveAttribute('data-on', 'true');
  await expect(tag(page, 'Riverside depot')).toHaveAttribute('data-on', 'true');
  await expect(altitude(page)).toHaveText('1,400');

  // And back: scrolling up reverses it.
  await scrollFilm(page, 1 / 6);
  await expect(chapter(page, 'Every asset.')).toHaveAttribute('data-on', 'true');
  await expect(chapter(page, 'Twelve sites. One login.')).toHaveAttribute('data-on', 'false');
  await expect(altitude(page)).toHaveText('118');
});

test('only one chapter is up at a time, and none between stops', async ({ page }) => {
  await page.goto('/');
  await scrollFilm(page, 0.25);
  await expect(page.locator('[data-chapter][data-on="true"]')).toHaveCount(0);
  await scrollFilm(page, 5 / 6);
  await expect(page.locator('[data-chapter][data-on="true"]')).toHaveCount(1);
  await expect(chapter(page, 'Every job, connected.')).toHaveAttribute('data-on', 'true');
});

test('the loading screen lets taps through once it is done', async ({ page }) => {
  await page.goto('/');
  const loader = page.locator('[data-loader]');
  await expect(loader).toHaveAttribute('data-done', '');
  await expect(loader).toHaveCSS('pointer-events', 'none');
});

test('the film draws the flight on its canvas', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-loader][data-done]')).toHaveCount(1);
  await scrollFilm(page, 2 / 6);
  await expect(page.locator('[data-film-stage][data-ready]')).toHaveCount(1);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const canvas = document.querySelector<HTMLCanvasElement>('[data-canvas]')!;
        const { data } = canvas.getContext('2d')!.getImageData(canvas.width / 2 - 20, canvas.height / 2 - 20, 40, 40);
        let lit = 0;
        for (let i = 0; i < data.length; i += 4) lit += data[i]! + data[i + 1]! + data[i + 2]!;
        return lit > 0;
      }),
    )
    .toBe(true);
});

test('the opening and closing buttons leave the tab order when they are not on screen', async ({ page }) => {
  await page.goto('/');
  const opening = page.locator('[data-hero-actions]');
  const closing = page.locator('[data-close-actions]');
  await expect(page.locator('[data-film="on"]')).toHaveCount(1);
  await expect(opening).toHaveJSProperty('inert', false);
  await expect(closing).toHaveJSProperty('inert', true);
  await scrollFilm(page, 0.5);
  await expect(opening).toHaveJSProperty('inert', true);
  await expect(closing).toHaveJSProperty('inert', true);
  await scrollFilm(page, 1);
  await expect(opening).toHaveJSProperty('inert', true);
  await expect(closing).toHaveJSProperty('inert', false);
  await scrollFilm(page, 0);
  await expect(opening).toHaveJSProperty('inert', false);
});

test('the film ends with the demo and sign-in links', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-film="on"]')).toHaveCount(1);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const final = page.getByRole('region', { name: 'One login for every site you look after.' });
  await expect(final.getByRole('heading', { name: 'One login for every site you look after.' })).toBeInViewport();
  await expect(final.getByRole('link', { name: 'Try the demo' })).toHaveAttribute('href', '/login#demo-heading');
  await expect(final.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute('href', '/login');
  await expect(final.getByText('Demo data only')).toBeVisible();
});

test('with reduced motion at 320px the film follows the scroll exactly and fits the screen', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await expect(page.locator('[data-hero]')).toHaveAttribute('data-on', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(axe.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map((node) => node.target) }))).toEqual([]);

  await scrollFilm(page, 2 / 6);
  await expect(chapter(page, 'Planned, not reactive.')).toHaveAttribute('data-on', 'true');
  await expect(altitude(page)).toHaveText('168');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});

test('the film has a written version for screen readers', async ({ page }) => {
  await page.goto('/');
  const film = page.getByRole('region', { name: 'One flight over a demo estate' });
  await expect(film.getByRole('listitem')).toHaveCount(7);
  await expect(film.getByRole('listitem').nth(2)).toContainText('roof deck with chillers');
});

test('the skip link jumps past the film', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to the demo' });
  await expect(skip).toBeFocused();
  await skip.press('Enter');
  await expect(page).toHaveURL(/\/#start$/);
  await expect(page.getByRole('heading', { name: 'One login for every site you look after.' })).toBeInViewport();
});

test('a link to the closing section lands on it once the film has its length', async ({ page }) => {
  await page.goto('/#start');
  await expect(page.locator('[data-film="on"]')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'One login for every site you look after.' })).toBeInViewport();
});

test('reloading part-way through keeps the place in the flight', async ({ page }) => {
  await page.goto('/');
  await scrollFilm(page, 2 / 6);
  await expect(altitude(page)).toHaveText('168');
  await page.reload();
  await expect(page.locator('[data-film="on"]')).toHaveCount(1);
  await expect(altitude(page)).toHaveText('168', { timeout: 2000 });
});

test('without JavaScript the homepage shows the opening words and its links', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Run every building.' })).toBeVisible();
    await expect(page.locator('[data-loader]')).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Every asset.' })).toBeHidden();
    await expect(page.locator('[data-hero]').getByRole('link', { name: 'Try the demo' })).toHaveAttribute(
      'href',
      '/login#demo-heading',
    );
    await page.getByRole('link', { name: 'Skip to the demo' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'One login for every site you look after.' })).toBeInViewport();
  } finally {
    await context.close();
  }
});
