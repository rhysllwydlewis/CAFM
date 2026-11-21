import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('the homepage motion leads from the desk to the completed job and its asset', async ({ page }) => {
  await page.goto('/');
  const scenes = page.getByRole('navigation', { name: 'Work order sequence' });
  await scenes.getByRole('button', { name: 'At the desk' }).click();
  await expect(scenes.getByRole('button', { name: 'At the desk' })).toHaveAttribute('aria-current', 'step');
  await scenes.getByRole('button', { name: 'Plant room' }).click();
  await expect(page.getByRole('heading', { name: 'In the plant room.' })).toBeInViewport();
  await scenes.getByRole('button', { name: 'On the job' }).click();
  await expect(page.getByRole('heading', { name: 'On the job.' })).toBeInViewport();

  const complete = page.getByRole('button', { name: 'Complete work order' });
  await expect(complete).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Filter replaced' }).check();
  await complete.press('Enter');
  const view = page.getByRole('link', { name: 'View work order' });
  await expect(view).toBeFocused();
  await view.press('Enter');
  await expect(page).toHaveURL(/\/#product$/);
  await expect(page.getByRole('tabpanel', { name: 'Work orders' })).toBeInViewport();
  await page.getByRole('button', { name: 'View asset AHU 02' }).click();
  await expect(page.getByRole('tab', { name: 'Assets' })).toBeFocused();
  await expect(page.getByRole('tabpanel', { name: 'Assets' }).getByText('Air handling unit')).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tabpanel', { name: 'Compliance' })).toBeVisible();
});

test('the checklist and product preview work with reduced motion at 320px', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Work order sequence' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute('href', '/login');
  await page.getByRole('checkbox', { name: 'Filter replaced' }).check();
  await page.getByRole('button', { name: 'Complete work order' }).click();
  await expect(page.getByRole('link', { name: 'View work order' })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(axe.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map((node) => node.target) }))).toEqual([]);
});
