import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function signInAs(page: Page, persona: string) {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByLabel('Email or username').fill(persona + '@demo.example');
  await page.getByLabel('Password', { exact: true }).fill('CafmDemo!2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function assertAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.map((violation) => [violation.id, violation.nodes.map((node) => node.target)])).toEqual([]);
}

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
/** "25 Nov 2026", as the screens show a day. */
const shown = (day: string) =>
  new Date(day + 'T00:00:00Z').toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

test('shows the planner, the schedules, the forecast, the overdue list and compliance, and keeps others out', async ({
  page,
}) => {
  await signInAs(page, 'manager');
  await page.goto('/app/ppm');
  await expect(page.getByRole('heading', { level: 1, name: 'Planned maintenance' })).toBeVisible();
  // The numbers at the top.
  for (const label of ['Due this week', 'Overdue', 'On time, last 12 months', 'Labour this month']) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  }
  // The planner has the demo schedules against the weeks, and says what is in each week.
  const planner = page.getByRole('region', { name: 'Planner, by week' });
  await expect(planner.getByRole('link', { name: 'Boiler annual service and gas safety check' })).toBeVisible();
  await expect(planner.getByRole('link', { name: 'Fire alarm weekly test' })).toBeVisible();
  await expect(planner.getByRole('columnheader', { name: /^Week \d+, from/ }).first()).toBeAttached();
  await expect(planner.getByText(/Week of .*: \d+ (scheduled|due|overdue)/).first()).toBeAttached();
  await assertAccessible(page);

  // Filters narrow the planner.
  await page.getByLabel('Criticality').selectOption({ label: 'Optimal' });
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(planner.getByRole('link', { name: 'AHU filter change' })).toBeVisible();
  await expect(planner.getByRole('link', { name: 'Fire alarm weekly test' })).toHaveCount(0);

  // The other views.
  await page.getByRole('link', { name: 'Schedules', exact: true }).click();
  const list = page.getByRole('region', { name: 'Schedules', exact: true });
  // The filter carries over from the planner, so only the optional schedules are listed.
  await expect(list.getByRole('link', { name: 'AHU filter change' })).toBeVisible();
  await expect(list.getByRole('link', { name: 'Lift thorough examination' })).toHaveCount(0);
  await expect(list.getByText('every 3 months').first()).toBeVisible();
  await assertAccessible(page);
  await page.getByRole('link', { name: 'Forecast' }).click();
  const forecast = page.getByRole('region', { name: 'Forecast by month' });
  await expect(forecast.getByRole('columnheader', { name: 'Estimated cost' })).toBeVisible();
  await expect(forecast.getByRole('row')).toHaveCount(14);
  await assertAccessible(page);
  await page.getByRole('link', { name: 'Overdue', exact: true }).click();
  await expect(
    page.getByRole('navigation', { name: 'Planned maintenance views' }).getByRole('link', { name: 'Overdue' }),
  ).toHaveAttribute('aria-current', 'page');
  await page
    .getByRole('navigation', { name: 'Planned maintenance views' })
    .getByRole('link', { name: 'Compliance' })
    .click();
  await expect(page.getByText(/visits that fell due in the last 12 months|No visits have fallen due/)).toBeVisible();
  await assertAccessible(page);

  // The technician has no planned maintenance, and is told so in the usual words.
  await signInAs(page, 'technician');
  await page.goto('/app/ppm');
  await expect(page.getByRole('heading', { name: 'Your role doesn’t include Planned maintenance' })).toBeVisible();
  await page.goto('/app/ppm/schedules/new');
  await expect(page).toHaveURL(/\/app\/ppm$/);
});

test('adds a task to the library, plans a schedule for it, puts an asset on it and raises the job', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const suffix = randomUUID().slice(0, 8);
  const taskName = 'E2E task ' + suffix;
  const title = 'E2E schedule ' + suffix;
  await signInAs(page, 'manager');

  // A task with a required tick and a reading.
  await page.goto('/app/ppm/tasks');
  await page.getByRole('link', { name: 'New task' }).click();
  await page.getByLabel('Name', { exact: true }).fill(taskName);
  await page.getByLabel('What is done').fill('Check the unit and record its pressure.');
  await page.getByLabel('Time for a visit (minutes)').fill('45');
  await page.getByRole('button', { name: 'Add a step' }).click();
  await page.getByLabel('Step 1 name').fill('Isolate the unit');
  await page.getByRole('button', { name: 'Add a step' }).click();
  await page.getByLabel('Step 2 name').fill('Discharge pressure');
  await page.getByLabel('Response').nth(1).selectOption({ label: 'Reading' });
  await page.getByLabel('Unit').fill('bar');
  // A step with no name is refused, and removing it puts that right.
  await page.getByRole('button', { name: 'Add a step' }).click();
  await page.getByRole('button', { name: 'Create task' }).click();
  await expect(page.getByText('Give every step a name, or remove it.')).toBeVisible();
  await page.getByRole('button', { name: 'Remove step 3' }).click();
  await assertAccessible(page);
  await page.getByRole('button', { name: 'Create task' }).click();
  await expect(page).toHaveURL(/\/app\/ppm\/tasks$/);
  const row = page.getByRole('row', { name: new RegExp(taskName) });
  await expect(row).toContainText('0.8 h');
  await expect(row).toContainText('2');

  // A schedule that uses it, monthly from a few days away.
  await page.goto('/app/ppm/schedules/new');
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Task from the library').selectOption({ label: taskName });
  await expect(page.getByLabel('Time for each visit (minutes)')).toHaveValue('45');
  await page.getByLabel('First visit', { exact: true }).fill(inDays(3));
  await page.getByLabel('Give the jobs to').selectOption({ label: 'Tom Price (Technician)' });
  await page.getByLabel(/^Estimated cost of a visit/).fill('48.90');
  await page.getByLabel('Every', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Create schedule' }).click();
  await expect(page.getByText('Enter how often, as a whole number from 1 to 120.')).toBeVisible();
  await page.getByLabel('Every', { exact: true }).fill('1');
  await assertAccessible(page);
  await page.getByRole('button', { name: 'Create schedule' }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(page.getByText('every month')).toBeVisible();
  await expect(page.getByText('£48.90')).toBeVisible();
  await expect(page.getByText('Isolate the unit')).toBeVisible();
  await expect(page.getByText('No assets are on this schedule yet.')).toBeVisible();
  const scheduleUrl = page.url();

  // An asset on it. A meter-less asset is fine for a calendar schedule.
  await page.getByLabel('Add an asset').fill('Boiler 2');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('button', { name: 'Add Boiler 2 to this schedule' }).click();
  await expect(page.getByText('Boiler 2 is on this schedule.')).toBeVisible();
  const assets = page.getByRole('region', { name: 'Assets', exact: true });
  await expect(assets.getByRole('link', { name: 'Boiler 2' })).toBeVisible();
  await expect(assets.getByText('Scheduled', { exact: true })).toBeVisible();

  // Raise the job now. It is inside its notice, so one job is raised, and the table links to it.
  await page.getByRole('button', { name: 'Generate now' }).click();
  await expect(page.getByText('1 job has been raised.')).toBeVisible();
  await expect(assets.getByText('Due', { exact: true }).last()).toBeVisible();
  await assets.getByRole('link', { name: shown(inDays(3)) }).click();
  await expect(page.getByRole('heading', { level: 1, name: `${title} · Boiler 2` })).toBeVisible();
  await expect(page.getByText(/^PPM-\d+, due /)).toBeVisible();
  const checklist = page.getByRole('region', { name: 'Checklists', exact: true });
  await expect(checklist.getByText('Isolate the unit')).toBeVisible();
  await expect(checklist.getByText('2 required to answer')).toBeVisible();

  // A task that a live schedule uses can't be retired, and the message says why.
  await page.goto('/app/ppm/tasks');
  await page.getByRole('link', { name: taskName }).click();
  await page.getByRole('button', { name: 'Retire this task' }).click();
  await expect(page.getByText('1 active schedule uses this task.')).toBeVisible();
  await page.goto(scheduleUrl);

  // Edit the schedule, then archive it.
  await page.getByRole('link', { name: 'Edit schedule' }).click();
  await page.getByLabel('Title').fill(title + ' (edited)');
  await page.getByRole('button', { name: 'Save schedule' }).click();
  await expect(page.getByRole('heading', { level: 1, name: title + ' (edited)' })).toBeVisible();
  await page.getByRole('link', { name: 'Edit schedule' }).click();
  await page.getByLabel(/Active\./).uncheck();
  await page.getByRole('button', { name: 'Save schedule' }).click();
  await expect(page.getByText('Archived').first()).toBeVisible();

  // Once the schedule is archived the task can go.
  await page.goto('/app/ppm/tasks');
  await page.getByRole('link', { name: taskName }).click();
  await page.getByRole('button', { name: 'Retire this task' }).click();
  await expect(page).toHaveURL(/\/app\/ppm\/tasks$/);
  await expect(page.getByRole('link', { name: taskName })).toHaveCount(0);
});
