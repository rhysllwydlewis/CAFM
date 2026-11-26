import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function signInAs(page: Page, persona: string) {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByLabel('Email or username').fill(persona + '@demo.example');
  await page.getByLabel('Password', { exact: true }).fill('FmsDemo!2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

test('a manager saves the work order filters as a view, reopens it and deletes it', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.goto('/app/work-orders?view=all&priority=1');
  const name = 'Emergency ' + Date.now();
  await page.getByRole('button', { name: 'Save current filters as a view' }).click();
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Save view' }).click();
  await expect(page).toHaveURL(/view_id=/);
  await expect(page).toHaveURL(/priority=1/);
  await expect(page.getByRole('combobox', { name: 'Saved view' })).toContainText(name);

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.map((violation) => violation.id)).toEqual([]);

  await page.goto('/app/work-orders');
  await page.getByRole('combobox', { name: 'Saved view' }).selectOption({ label: name });
  await expect(page).toHaveURL(/priority=1/);
  await expect(page.locator('select[name="priority"]')).toHaveValue('1');

  await page.getByRole('button', { name: 'Delete view' }).click();
  await expect(page).not.toHaveURL(/view_id=/);
  await expect(page.getByRole('combobox', { name: 'Saved view' })).not.toContainText(name);
});

test('a manager sorts the work orders by title and keeps the order in a saved view', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.goto('/app/work-orders?view=all');
  await page.getByLabel('Sort by').selectOption('title');
  await page.getByLabel('Sort order').selectOption('asc');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page).toHaveURL(/sort=title/);
  await expect(page).toHaveURL(/dir=asc/);
  const titles = await page
    .locator('tbody tr')
    .evaluateAll((rows) => rows.map((row) => row.querySelector('a.medium')?.textContent?.trim() ?? ''));
  expect(titles.length).toBeGreaterThan(1);
  // The database decides how text sorts, so compare with the opposite order rather than with a guess at its rules.
  await page.getByLabel('Sort order').selectOption('desc');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page).toHaveURL(/dir=desc/);
  const reversed = await page
    .locator('tbody tr')
    .evaluateAll((rows) => rows.map((row) => row.querySelector('a.medium')?.textContent?.trim() ?? ''));
  expect(reversed).toEqual([...titles].reverse());
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.map((violation) => violation.id)).toEqual([]);
});

const sortable = [
  { name: 'assets', path: '/app/assets', by: 'Name', link: 'tbody tr a[href^="/app/assets/"]' },
  { name: 'requests', path: '/app/helpdesk?view=all', by: 'Number', link: 'tbody tr a.ref' },
  { name: 'planned maintenance schedules', path: '/app/ppm?view=list', by: 'Reference', link: 'tbody tr a' },
] as const;

for (const list of sortable) {
  test(`a manager sorts the ${list.name} list in either direction`, async ({ page }) => {
    await signInAs(page, 'manager');
    const firstRow = async (order: 'asc' | 'desc') => {
      await page.goto(list.path);
      await page.getByLabel('Sort by').selectOption({ label: list.by });
      await page.getByLabel('Sort order').selectOption(order);
      await page.getByRole('button', { name: 'Apply filters' }).click();
      await expect(page).toHaveURL(new RegExp('dir=' + order));
      return (await page.locator(list.link).first().textContent())?.trim();
    };
    const lowest = await firstRow('asc');
    const highest = await firstRow('desc');
    expect(lowest).toBeTruthy();
    expect(highest).toBeTruthy();
    expect(highest).not.toBe(lowest);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
}

const displayable = [
  { name: 'work orders', path: '/app/work-orders?view=all', group: 'Status', hide: 'Assigned to' },
  { name: 'assets', path: '/app/assets', group: 'Status', hide: 'Make / model' },
  { name: 'requests', path: '/app/helpdesk?view=all', group: 'Priority', hide: 'Channel' },
  { name: 'planned maintenance schedules', path: '/app/ppm?view=list', group: 'Criticality', hide: 'Assigned to' },
] as const;

for (const list of displayable) {
  test(`a manager groups the ${list.name} and hides a column`, async ({ page }) => {
    await signInAs(page, 'manager');
    await page.goto(list.path);
    await expect(page.getByRole('columnheader', { name: list.hide, exact: true })).toBeVisible();
    await page.getByLabel('Group by').selectOption({ label: list.group });
    await page.getByText('Columns', { exact: true }).click();
    await page.getByRole('checkbox', { name: 'Show ' + list.hide + ' column' }).uncheck();
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page).toHaveURL(/groupby=/);
    await expect(page).toHaveURL(/cols=/);
    await expect(page.getByRole('columnheader', { name: list.hide, exact: true })).toHaveCount(0);
    expect(await page.locator('th[scope="colgroup"]').count()).toBeGreaterThan(0);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
}

test('a saved view keeps the grouping and the columns', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.goto('/app/work-orders?view=all&groupby=status&cols=priority,status&status=open');
  const name = 'Grouped ' + Date.now();
  await page.getByRole('button', { name: 'Save current filters as a view' }).click();
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Save view' }).click();
  await expect(page).toHaveURL(/view_id=/);
  await expect(page).toHaveURL(/groupby=status/);
  await expect(page.getByRole('columnheader', { name: 'SLA (fix)' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Delete view' }).click();
  await expect(page).not.toHaveURL(/view_id=/);
});

test('hiding every optional column keeps only the locked ones', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.goto('/app/work-orders?view=all');
  await page.getByText('Columns', { exact: true }).click();
  for (const label of ['Priority', 'Status', 'Assigned to', 'SLA (fix)']) {
    await page.getByRole('checkbox', { name: 'Show ' + label + ' column' }).uncheck();
  }
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByRole('columnheader', { name: 'Ref', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Status', exact: true })).toHaveCount(0);
});
