import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const CHAPTERS = [
  { id: 'ground', title: 'Run every building.' },
  { id: 'facade', title: 'Every request, one queue.' },
  { id: 'roof', title: 'Planned, not reactive.' },
  { id: 'skyline', title: 'Compliance you can prove.' },
  { id: 'estate', title: 'Every site, one login.' },
] as const;

const film = (page: Page) => page.locator('[data-film]');

/** The film is ready when the page has measured its chapters and worked out which one is showing. */
async function filmReady(page: Page) {
  await expect(film(page)).toHaveAttribute('data-active-section', /^\d$/);
}

/** Scroll to a point in a chapter, as a share of the scrolling that chapter takes. */
async function scrollToChapter(page: Page, id: string, share = 0.5) {
  await page.evaluate(
    ([chapter, at]) => {
      const band = document.getElementById(chapter as string)!;
      const top = band.getBoundingClientRect().top + window.scrollY;
      window.scrollTo(0, top + (at as number) * (band.offsetHeight - window.innerHeight));
    },
    [id, share] as const,
  );
}

test('the opening says what FM Stead is and offers the demo and sign in', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Run every building.' })).toBeVisible();
  const opening = page.locator('#ground');
  await expect(opening.getByText('Facilities management software for UK estates teams.')).toBeVisible();
  await expect(opening.getByRole('link', { name: 'Try the demo' })).toHaveAttribute('href', '/login#demo-heading');
  await expect(opening.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute('href', '/login');
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

test('the five chapters read in order, each with its own heading', async ({ page }) => {
  await page.goto('/');
  const headings = film(page).getByRole('heading');
  await expect(headings).toHaveText(CHAPTERS.map((chapter) => chapter.title));
  await expect(headings.first()).toHaveJSProperty('tagName', 'H1');
  await expect(page.locator('#facade').getByText('Helpdesk', { exact: true })).toBeVisible();
});

test('scrolling moves through the chapters, and scrolling back reverses it', async ({ page }) => {
  await page.goto('/');
  await filmReady(page);
  for (const [index, chapter] of CHAPTERS.entries()) {
    await scrollToChapter(page, chapter.id);
    await expect(film(page)).toHaveAttribute('data-active-section', String(index));
  }
  await scrollToChapter(page, 'facade');
  await expect(film(page)).toHaveAttribute('data-active-section', '1');
  await scrollToChapter(page, 'ground', 0);
  await expect(film(page)).toHaveAttribute('data-active-section', '0');
});

test('the chapter navigation shows where you are and jumps to a chapter; phones scroll instead', async ({ page }) => {
  await page.goto('/');
  await filmReady(page);
  const nav = page.getByRole('navigation', { name: 'Chapters' });
  const wide = (page.viewportSize()?.width ?? 0) > 860;
  if (!wide) {
    await expect(nav).toBeHidden();
    return;
  }
  await expect(nav.getByRole('button')).toHaveCount(5);
  await expect(nav.getByRole('button', { name: 'Street' })).toHaveAttribute('aria-current', 'step');
  await nav.getByRole('button', { name: 'Compliance' }).click();
  await expect(film(page)).toHaveAttribute('data-active-section', '3');
  await expect(nav.getByRole('button', { name: 'Compliance' })).toHaveAttribute('aria-current', 'step');
  await expect(nav.getByRole('button', { name: 'Street' })).not.toHaveAttribute('aria-current', 'step');
});

test('every clip is fetched up front on a computer, and the loading line finishes', async ({ page, isMobile }) => {
  const clips = new Set<string>();
  page.on('response', (response) => {
    const { pathname } = new URL(response.url());
    if (pathname.startsWith('/homepage/film/') && pathname.endsWith('.mp4') && response.ok()) clips.add(pathname);
  });
  await page.goto('/');
  await filmReady(page);
  // A computer fetches all five at once so a fast scroll never lands on a clip that is still downloading.
  // A phone fetches only the ones near the reader, and its lighter versions.
  if (!isMobile) {
    await expect.poll(() => [...clips].sort()).toEqual(CHAPTERS.map((c) => `/homepage/film/${c.id}.mp4`).sort());
    await expect
      .poll(() => film(page).evaluate((el) => (el as HTMLElement).style.getPropertyValue('--loaded')))
      .toBe('1');
  } else {
    await expect.poll(() => clips.size).toBeGreaterThan(0);
    expect([...clips].every((path) => path.endsWith('-mobile.mp4'))).toBe(true);
  }
});

test('with reduced motion no film is downloaded and every chapter still has its picture', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const clips: string[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith('.mp4')) clips.push(request.url());
  });
  await page.goto('/');
  await filmReady(page);
  await scrollToChapter(page, 'roof');
  await expect(film(page)).toHaveAttribute('data-active-section', '2');
  await expect(page.getByRole('heading', { name: 'Planned, not reactive.' })).toBeVisible();
  expect(clips).toEqual([]);
  // Five posters, one per chapter, and the first one shows.
  await expect(film(page).locator('img')).toHaveCount(5);
});

test('at 320px the page fits the screen and has no accessibility violations', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await filmReady(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(axe.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map((node) => node.target) }))).toEqual([]);
  await scrollToChapter(page, 'skyline');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});

test('the product screens load, with a description each', async ({ page }) => {
  await page.goto('/');
  const section = page.getByRole('region', { name: 'Everything in one clear view.' });
  await section.scrollIntoViewIfNeeded();
  const screens = section.getByRole('img');
  await expect(screens).toHaveCount(4);
  for (const [index, name] of [
    /dashboard/,
    /work order for a boiler/,
    /compliance matrix/,
    /technician mobile app/,
  ].entries()) {
    const screen = screens.nth(index);
    await screen.scrollIntoViewIfNeeded();
    await expect(screen).toHaveAccessibleName(name);
    await expect.poll(() => screen.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
  await expect(section.getByText('Design screens, shown with demo data.')).toBeVisible();
});

test('it says who it is for and what sets it apart', async ({ page }) => {
  await page.goto('/');
  const who = page.getByRole('region', { name: 'Made for UK estates and FM teams.' });
  await expect(who.getByRole('heading', { level: 3 })).toHaveText([
    'FM service providers',
    'Education',
    'Commercial property',
    'Housing associations',
    'Healthcare and hospitality',
  ]);
  const apart = page.getByRole('region', { name: 'What sets it apart.' });
  await expect(apart.getByRole('heading', { level: 3 })).toHaveCount(5);
  await expect(apart.getByRole('heading', { name: 'UK compliance built in' })).toBeAttached();
});

test('the page ends with the demo and sign-in links', async ({ page }) => {
  await page.goto('/');
  await filmReady(page);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const final = page.getByRole('region', { name: 'One login for every site you look after.' });
  await expect(final.getByRole('heading', { name: 'One login for every site you look after.' })).toBeInViewport();
  await expect(final.getByRole('link', { name: 'Try the demo' })).toHaveAttribute('href', '/login#demo-heading');
  await expect(final.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute('href', '/login');
  await expect(final.getByText('Demo data only')).toBeVisible();
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
  await filmReady(page);
  await expect(page.getByRole('heading', { name: 'One login for every site you look after.' })).toBeInViewport();
});

test('search engines are told what the product is', async ({ page }) => {
  await page.goto('/');
  const data = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}');
  expect(data).toMatchObject({
    '@type': 'SoftwareApplication',
    name: 'FM Stead',
    applicationCategory: 'BusinessApplication',
  });
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /\/homepage\/og\.jpg$/);
  await expect(page).toHaveTitle('FM Stead | Facilities management software');
});

test('without JavaScript the homepage shows the opening words, every chapter and its links', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Run every building.' })).toBeVisible();
    await expect(page.locator('#ground').getByRole('link', { name: 'Try the demo' })).toHaveAttribute(
      'href',
      '/login#demo-heading',
    );
    for (const chapter of CHAPTERS) await expect(page.getByRole('heading', { name: chapter.title })).toBeAttached();
    await page.getByRole('link', { name: 'Skip to the demo' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'One login for every site you look after.' })).toBeInViewport();
  } finally {
    await context.close();
  }
});
