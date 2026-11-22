import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { PrismaClient, seedId } from '@cafm/db';

async function signIn(page: Page, persona: string) {
  await page.getByLabel('Email or username').fill(persona + '@demo.example');
  await page.getByLabel('Password', { exact: true }).fill('CafmDemo!2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
}

async function signInAs(page: Page, persona: string) {
  await page.context().clearCookies();
  await page.goto('/login');
  await signIn(page, persona);
  await expect(page).not.toHaveURL(/\/login/);
}

async function assertAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.map((violation) => [violation.id, violation.nodes.map((node) => node.target)])).toEqual([]);
}

/** The status badge at the top of the job, which changes only once the update has been saved. */
async function expectStatus(page: Page, text: string) {
  await expect(page.locator('.page-head .badge').first()).toHaveText(text);
}

async function updateStatus(page: Page, label: string, extra?: { reason?: string }) {
  await page.getByLabel('New status').selectOption({ label });
  if (extra?.reason) await page.getByLabel('Why is it paused?').selectOption({ label: extra.reason });
  await page.getByRole('button', { name: 'Update status' }).click();
}

test('lists and filters jobs, shows the board, and gives a technician only their own jobs', async ({ page }) => {
  await signInAs(page, 'manager');
  await page.goto('/app/work-orders');
  await expect(page.getByRole('heading', { level: 1, name: 'Work orders' })).toBeVisible();
  const results = page.getByRole('region', { name: 'Work order results' });
  // Other tests raise jobs too, so find the demo job by searching rather than by its place in the list.
  await page.getByLabel('Search work orders').fill('losing pressure');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(results.getByRole('link', { name: 'WO-10412' })).toBeVisible();
  await expect(results.getByText('Boiler 2 losing pressure overnight')).toBeVisible();
  await assertAccessible(page);

  await page.getByLabel('Search work orders').fill('door closer');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(results.getByRole('link', { name: 'WO-10409' })).toBeVisible();
  await expect(results.getByRole('link', { name: 'WO-10412' })).toHaveCount(0);
  // The search stays when the view changes, so clear it before looking at the unassigned jobs.
  await page.getByLabel('Search work orders').fill('');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await page.getByRole('link', { name: 'Unassigned' }).click();
  await page.getByLabel('Search work orders').fill('meeting room heating');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByRole('link', { name: 'WO-10410' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'WO-10412' })).toHaveCount(0);

  await page.getByRole('link', { name: 'Board' }).click();
  const board = page.getByRole('group', { name: 'Work order board' });
  await expect(
    board.getByRole('region', { name: 'To assign' }).getByRole('link', { name: 'WO-10410' }).first(),
  ).toBeVisible();
  await expect(board.getByRole('region', { name: 'In progress' })).toBeVisible();
  await assertAccessible(page);

  await page.goto('/app/work-orders/' + seedId('work-order:demo-estates:WO-10412'));
  await expect(page.getByRole('heading', { level: 1, name: 'Boiler 2 losing pressure overnight' })).toBeVisible();
  await expect(page.getByText('Assigned to', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Boiler 2/ })).toBeVisible();
  await assertAccessible(page);

  // A technician sees their own jobs only, and cannot raise or assign work.
  await signInAs(page, 'technician');
  await page.goto('/app/work-orders?view=all&q=losing pressure');
  const own = page.getByRole('region', { name: 'Work order results' });
  await expect(own.getByRole('link', { name: 'WO-10412' })).toBeVisible();
  // The unassigned Bristol job exists, but it is not theirs, so it is not found.
  await page.goto('/app/work-orders?view=all&q=heating');
  await expect(page.getByText('No work orders match this view.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'New work order' })).toHaveCount(0);
  await page.goto('/app/work-orders/' + seedId('work-order:demo-estates:WO-10410'));
  await expect(page.getByText('This page could not be found.')).toBeVisible();
});

test('raises a job, assigns it, takes it through each step and raises work from a request', async ({ page }) => {
  test.setTimeout(120_000);
  const suffix = randomUUID().slice(0, 8);
  const title = 'E2E pump check ' + suffix;
  await signInAs(page, 'helpdesk');
  await page.goto('/app/work-orders');
  await page.getByRole('link', { name: 'New work order' }).click();
  const dialog = page.getByRole('dialog', { name: 'New work order' });
  await dialog.getByLabel('Find location').fill('Cardiff');
  await expect(dialog.getByRole('option', { name: 'Cardiff HQ · CDF' })).toBeAttached();
  await dialog.getByLabel('Location', { exact: true }).selectOption({ label: 'Cardiff HQ · CDF' });
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByLabel('Description').fill('Check the circulation pump.');
  await dialog.getByRole('button', { name: 'Create work order' }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expectStatus(page, 'Logged');

  // Assign it to the technician.
  const assignee = page.getByLabel('Assignee', { exact: true });
  await expect(assignee.getByRole('option', { name: 'Tom Price' })).toBeAttached();
  await assignee.selectOption({ label: 'Tom Price' });
  await page.getByRole('button', { name: 'Save assignment' }).click();
  await expect(page.getByText('Assigned to Tom Price')).toBeVisible();
  const url = page.url();

  // The technician does the job.
  await signInAs(page, 'technician');
  await page.goto(url);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save assignment' })).toHaveCount(0);
  await expect(page.getByText('Edit details and priority')).toHaveCount(0);
  await updateStatus(page, 'Accepted');
  await expectStatus(page, 'Accepted');
  await updateStatus(page, 'On site');
  await expectStatus(page, 'On site');
  await updateStatus(page, 'Paused', { reason: 'Awaiting parts' });
  await expectStatus(page, 'Paused · Awaiting parts');
  await updateStatus(page, 'On site');
  await expectStatus(page, 'On site');
  await page.getByLabel('Add a note').fill('Seal replaced and pressure tested.');
  await page.getByRole('button', { name: 'Add note' }).click();
  await expect(page.getByText('Seal replaced and pressure tested.')).toBeVisible();
  await updateStatus(page, 'Completed');
  await expectStatus(page, 'Completed');
  // Verifying and closing are for someone who can edit work orders, so the technician has no further steps.
  await expect(page.getByLabel('New status')).toHaveCount(0);

  await signInAs(page, 'helpdesk');
  await page.goto(url);
  await updateStatus(page, 'Verified');
  await expectStatus(page, 'Verified');
  await updateStatus(page, 'Closed');
  await expectStatus(page, 'Closed');
  await expect(page.getByLabel('New status')).toHaveCount(0);
  await assertAccessible(page);

  // Raise two jobs from a request.
  const created = await page.request.post('/api/helpdesk/requests', {
    data: {
      submissionId: randomUUID(),
      title: 'E2E leak ' + suffix,
      description: 'Water on the floor by the pump.',
      locationId: seedId('location:demo-estates:CDF'),
      typeId: seedId('request-type:demo-estates:other'),
      channel: 'phone',
      // Raised for the requester persona, so the helpdesk operator's notifications stay as they were.
      requesterId: seedId('membership:demo-estates:requester'),
    },
  });
  expect(created.ok()).toBe(true);
  const request = (await created.json()) as { id: string; number: string };
  await page.goto('/app/helpdesk/' + request.id);
  const panel = page.getByRole('region', { name: 'Work orders' });
  await expect(panel.getByText('No work orders have been raised from this request.')).toBeVisible();
  await panel.getByLabel('Title').fill('Stop the leak ' + suffix);
  await panel.getByRole('button', { name: 'Add another job' }).click();
  await panel
    .getByLabel('Title')
    .nth(1)
    .fill('Dry the floor ' + suffix);
  await panel.getByRole('button', { name: 'Raise 2 work orders' }).click();
  await expect(panel.getByText('Stop the leak ' + suffix)).toBeVisible();
  await expect(panel.getByText('Dry the floor ' + suffix)).toBeVisible();
  await expect(page.getByText('In progress', { exact: true }).first()).toBeVisible();
  await assertAccessible(page);
  await panel.getByRole('link', { name: /^WO-/ }).first().click();
  await expect(page.getByText(request.number)).toBeVisible();
});

test('sends a job to a contractor, who updates it from the emailed link without an account', async ({
  page,
  browser,
}) => {
  test.setTimeout(120_000);
  const suffix = randomUUID().slice(0, 8);
  const title = 'E2E contractor job ' + suffix;
  const email = 'e2e-' + suffix + '@sparks.test';
  const db = new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL ?? 'postgresql://cafm:cafm@localhost:5432/cafm_dev',
  });
  const outside = await browser.newContext();
  try {
    await signInAs(page, 'helpdesk');
    const created = await page.request.post('/api/work-orders', {
      data: {
        submissionId: randomUUID(),
        title,
        description: 'Replace the failed LED driver in the entrance lobby.',
        locationId: seedId('location:demo-estates:CDF'),
        impact: 2,
        urgency: 2,
      },
    });
    expect(created.ok()).toBe(true);
    const job = (await created.json()) as { id: string; number: string };
    await page.goto('/app/work-orders/' + job.id);
    await page.getByLabel('Contractor name').fill('Sparks Electrical Ltd');
    await page.getByLabel('Contractor email').fill(email);
    await page.getByRole('button', { name: 'Send to contractor' }).click();
    await expect(page.getByText(/With Sparks Electrical Ltd/)).toBeVisible();
    await expect(page.getByText('Sent to Sparks Electrical Ltd (contractor)')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Take the job back' })).toBeVisible();

    // The email carries the link. Demo email is captured rather than sent, and the message is queued.
    const queued = await db.outboxMessage.findMany({
      where: { topic: 'email.send' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const text = queued
      .map(({ payload }) => payload as { to: string; text: string })
      .find(({ to }) => to === email)?.text;
    const link = /\/job\/([\w-]+)/.exec(text ?? '')?.[0];
    expect(link).toBeTruthy();

    // The contractor has no account and no session.
    const contractor = await outside.newPage();
    await contractor.goto(link!);
    await expect(contractor.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(contractor.getByText('For Sparks Electrical Ltd', { exact: true })).toBeVisible();
    await assertAccessible(contractor);
    const step = async (label: string) => {
      await contractor.getByLabel('What’s next?').selectOption({ label });
      await contractor.getByRole('button', { name: 'Update job' }).click();
    };
    await step('Accept the job');
    await expect(contractor.locator('header .badge').first()).toHaveText('Accepted');
    await step('I’m on site');
    await expect(contractor.locator('header .badge').first()).toHaveText('On site');
    await contractor.getByLabel('Add a note').fill('Driver replaced, testing now.');
    await contractor.getByRole('button', { name: 'Add note' }).click();
    await expect(contractor.getByText('Driver replaced, testing now.')).toBeVisible();
    await step('Job complete');
    await expect(contractor.locator('header .badge').first()).toHaveText('Completed');
    await expect(contractor.getByLabel('What’s next?')).toHaveCount(0);
    await assertAccessible(contractor);
    await contractor.goto('/job/not-a-real-token');
    await expect(contractor.getByRole('heading', { name: 'This link isn’t valid' })).toBeVisible();

    // The team sees what the contractor did.
    await page.reload();
    await expectStatus(page, 'Completed');
    await expect(page.getByText('Driver replaced, testing now.')).toBeVisible();
    await expect(page.getByText('Sparks Electrical Ltd').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Take the job back' })).toHaveCount(0);
  } finally {
    await outside.close();
    await db.$disconnect();
  }
});

test('moves a card on the board, edits a job and takes a job back from a contractor', async ({ page }) => {
  test.setTimeout(120_000);
  const suffix = randomUUID().slice(0, 8);
  await signInAs(page, 'helpdesk');
  const raise = async (title: string, extra: object = {}) => {
    const response = await page.request.post('/api/work-orders', {
      data: {
        submissionId: randomUUID(),
        title,
        description: 'Created by a browser test.',
        locationId: seedId('location:demo-estates:CDF'),
        impact: 2,
        urgency: 2,
        ...extra,
      },
    });
    expect(response.ok()).toBe(true);
    return (await response.json()) as { id: string; number: string };
  };
  const boardJob = await raise('E2E board ' + suffix, { assigneeId: seedId('membership:demo-estates:technician') });

  // Move a card from Assigned to In progress with the card's own menu.
  await page.goto('/app/work-orders?view=all&layout=board&q=' + suffix);
  const board = page.getByRole('group', { name: 'Work order board' });
  const assigned = board.getByRole('region', { name: 'Assigned' });
  await expect(assigned.getByRole('link', { name: boardJob.number }).first()).toBeVisible();
  await assigned.getByLabel('Move ' + boardJob.number + ' to').selectOption({ label: 'On site' });
  await expect(
    board.getByRole('region', { name: 'In progress' }).getByRole('link', { name: boardJob.number }).first(),
  ).toBeVisible();
  await expect(assigned.getByRole('link', { name: boardJob.number })).toHaveCount(0);
  // Opening the new-job form from the board keeps the board when it is closed.
  await page.getByRole('link', { name: 'New work order' }).click();
  await page.getByRole('dialog', { name: 'New work order' }).getByRole('link', { name: 'Close' }).click();
  await expect(page.getByRole('group', { name: 'Work order board' })).toBeVisible();

  // Edit the details and priority of another job.
  const editable = await raise('E2E edit ' + suffix);
  await page.goto('/app/work-orders/' + editable.id);
  await page.getByText('Edit details and priority').click();
  await page.getByLabel('Title', { exact: true }).fill('E2E edited ' + suffix);
  await page.getByLabel('Impact').selectOption({ label: 'High' });
  await page.getByLabel('Urgency').selectOption({ label: 'High' });
  await page.getByRole('button', { name: 'Save details' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'E2E edited ' + suffix })).toBeVisible();
  await expect(page.locator('.page-head .badge').nth(1)).toHaveText('P1 Emergency');
  await expect(page.getByText('Priority and targets updated')).toBeVisible();

  // Send a job to a contractor and take it back before they start.
  const returned = await raise('E2E withdraw ' + suffix);
  await page.goto('/app/work-orders/' + returned.id);
  await page.getByLabel('Contractor name').fill('Sparks Electrical Ltd');
  await page.getByLabel('Contractor email').fill('e2e-' + suffix + '@sparks.test');
  await page.getByRole('button', { name: 'Send to contractor' }).click();
  await expect(page.getByText(/can read notes that aren’t marked internal/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send the link again' })).toBeVisible();
  await page.getByRole('button', { name: 'Take the job back' }).click();
  await expect(page.getByText('Taken back from Sparks Electrical Ltd')).toBeVisible();
  await expectStatus(page, 'Logged');
  await expect(page.getByRole('button', { name: 'Send to contractor' })).toBeVisible();
  await assertAccessible(page);
});

test('stops the SLA clock for a pause that is not the team’s fault, and links alerts to the job', async ({ page }) => {
  test.setTimeout(120_000);
  const suffix = randomUUID().slice(0, 8);
  const db = new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL ?? 'postgresql://cafm:cafm@localhost:5432/cafm_dev',
  });
  let alertId: string | undefined;
  try {
    await signInAs(page, 'helpdesk');
    const created = await page.request.post('/api/work-orders', {
      data: {
        submissionId: randomUUID(),
        title: 'E2E clock ' + suffix,
        description: 'Created by a browser test.',
        locationId: seedId('location:demo-estates:CDF'),
        impact: 2,
        urgency: 2,
        assigneeId: seedId('membership:demo-estates:technician'),
      },
    });
    expect(created.ok()).toBe(true);
    const job = (await created.json()) as { id: string; number: string };
    await page.goto('/app/work-orders/' + job.id);
    await updateStatus(page, 'On site');
    await expectStatus(page, 'On site');

    // The job page shows where it stands on each target. Giving it to someone was the response.
    const sla = page.getByRole('region', { name: 'SLA targets' });
    const target = (label: string) =>
      sla.locator('div.row').filter({ has: page.locator('dt', { hasText: new RegExp('^' + label + '$') }) });
    await expect(target('Response').getByText('Met')).toBeVisible();
    await expect(target('Attendance').getByText('Met')).toBeVisible();
    await expect(target('Fix').getByText(/left|Breached/)).toBeVisible();

    // The screen says which reasons stop the clock before the pause is saved.
    await page.getByLabel('New status').selectOption({ label: 'Paused' });
    await page.getByLabel('Why is it paused?').selectOption({ label: 'Awaiting contractor' });
    await expect(page.getByText('The SLA clock keeps running for this reason.')).toBeVisible();
    await page.getByLabel('Why is it paused?').selectOption({ label: 'Awaiting parts' });
    await expect(page.getByText(/This stops the SLA clock/)).toBeVisible();
    await page.getByRole('button', { name: 'Update status' }).click();
    await expectStatus(page, 'Paused · Awaiting parts');
    await expect(page.getByText(/Stopped since/)).toBeVisible();
    await expect(target('Fix').getByText('Clock stopped')).toBeVisible();

    // The list shows no countdown while the clock is stopped.
    await page.goto('/app/work-orders?view=all&q=' + suffix);
    await expect(page.getByRole('region', { name: 'Work order results' }).getByText('Clock stopped')).toBeVisible();
    await assertAccessible(page);

    // Resuming starts the clock again.
    await page.goto('/app/work-orders/' + job.id);
    await updateStatus(page, 'On site');
    await expectStatus(page, 'On site');
    await expect(page.getByText(/Stopped since/)).toHaveCount(0);

    // An alert in the drawer opens the job.
    const alert = await db.notification.create({
      data: {
        tenantId: seedId('tenant:demo-estates'),
        recipientId: seedId('membership:demo-estates:manager'),
        workOrderId: job.id,
        eventKey: 'e2e-alert-' + suffix,
        title: 'Work order ' + job.number + ' is close to its fix target',
        body: 'E2E clock job.',
      },
    });
    alertId = alert.id;
    await signInAs(page, 'manager');
    await page.getByRole('button', { name: 'Notifications' }).click();
    const drawer = page.getByRole('dialog', { name: 'Notifications' });
    // The desktop and mobile runs each raise an alert for the same person, so find this job's own.
    const item = drawer.locator('article', { hasText: job.number });
    await expect(item.getByText('is close to its fix target')).toBeVisible();
    await item.getByRole('link', { name: 'Open work order' }).click();
    await expect(page).toHaveURL('/app/work-orders/' + job.id);
    await expect(page.getByRole('heading', { level: 1, name: 'E2E clock ' + suffix })).toBeVisible();
  } finally {
    if (alertId) await db.notification.delete({ where: { id: alertId } }).catch(() => undefined);
    await db.$disconnect();
  }
});

test('records costs, applies a not-to-exceed limit, and keeps costs from field staff', async ({ page }) => {
  test.setTimeout(120_000);
  const suffix = randomUUID().slice(0, 8);
  await signInAs(page, 'manager');
  const created = await page.request.post('/api/work-orders', {
    data: {
      submissionId: randomUUID(),
      title: 'E2E costs ' + suffix,
      description: 'Created by a browser test.',
      locationId: seedId('location:demo-estates:CDF'),
      impact: 2,
      urgency: 2,
      assigneeId: seedId('membership:demo-estates:technician'),
    },
  });
  expect(created.ok()).toBe(true);
  const job = (await created.json()) as { id: string };
  await page.goto('/app/work-orders/' + job.id);
  const costs = page.getByRole('region', { name: 'Costs', exact: true });
  const total = costs.locator('strong.page-title');
  await expect(total).toHaveText('£0.00');

  // Labour is hours at a rate, and the screen shows the amount before it is saved.
  const add = costs.getByRole('form', { name: 'Add a cost' });
  await add.getByLabel('Description').fill('E2E labour');
  await add.getByLabel('Hours').fill('2.5');
  await add.getByLabel('Rate per hour').fill('46.00');
  await expect(add.getByText('This will cost £115.00.')).toBeVisible();
  await add.getByRole('button', { name: 'Add cost' }).click();
  await expect(total).toHaveText('£115.00');

  // A single amount, such as an expense, has no quantity.
  await add.getByLabel('Type').selectOption({ label: 'Expenses' });
  await add.getByLabel('Description').fill('E2E parking');
  await add.getByLabel(/^Amount/).fill('6.50');
  await add.getByRole('button', { name: 'Add cost' }).click();
  await expect(total).toHaveText('£121.50');
  // The form keeps the type that was chosen, so several of one kind can be entered in a row.
  await expect(add.getByLabel('Type')).toHaveValue('expense');

  // Bad figures are explained, not sent.
  await add.getByLabel('Description').fill('E2E bad');
  await add.getByLabel(/^Amount/).fill('6.555');
  await add.getByRole('button', { name: 'Add cost' }).click();
  await expect(costs.getByText('Enter the amount in pounds, like 48.90.')).toBeVisible();
  await expect(total).toHaveText('£121.50');

  // A limit, then spend over it needs a reason.
  const limit = costs.getByRole('form', { name: 'Cost limit' });
  await limit.getByLabel(/^Limit/).fill('150');
  await limit.getByRole('button', { name: 'Save limit' }).click();
  await expect(costs.getByText('81% used')).toBeVisible();
  await add.getByLabel('Description').fill('E2E hire');
  await add.getByLabel(/^Amount/).fill('40');
  await add.getByRole('button', { name: 'Add cost' }).click();
  await expect(costs.getByText(/over its limit of £150.00/)).toBeVisible();
  await expect(total).toHaveText('£121.50');
  await add.getByLabel('Why does this go over the limit?').fill('Agreed by phone');
  await add.getByRole('button', { name: 'Add it over the limit' }).click();
  await expect(total).toHaveText('£161.50');
  await expect(costs.getByText('Agreed by phone')).toBeVisible();
  await expect(costs.getByText('Over the limit').first()).toBeVisible();
  await assertAccessible(page);

  // Removing a cost puts the total right.
  await costs.getByRole('button', { name: 'Remove E2E hire' }).click();
  await expect(total).toHaveText('£121.50');
  await expect(costs.getByText('E2E hire')).toHaveCount(0);

  // The list carries the total for people who may see costs.
  await page.goto('/app/work-orders?view=all&q=' + suffix);
  const results = page.getByRole('region', { name: 'Work order results' });
  await expect(results.getByRole('columnheader', { name: 'Cost' })).toBeVisible();
  await expect(results.getByText('£121.50')).toBeVisible();

  // The technician who does the job sees no money at all.
  await signInAs(page, 'technician');
  await page.goto('/app/work-orders/' + job.id);
  await expect(page.getByRole('heading', { level: 1, name: 'E2E costs ' + suffix })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Costs', exact: true })).toHaveCount(0);
  await expect(page.getByText('£121.50')).toHaveCount(0);
  await page.goto('/app/work-orders?view=all&q=' + suffix);
  await expect(page.getByRole('link', { name: /^WO-/ }).first()).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Cost' })).toHaveCount(0);
});

test('works through a checklist, adds a photo, signs the job off and makes a job sheet', async ({ page }) => {
  test.setTimeout(150_000);
  const suffix = randomUUID().slice(0, 8);
  await signInAs(page, 'manager');
  const created = await page.request.post('/api/work-orders', {
    data: {
      submissionId: randomUUID(),
      title: 'E2E forms ' + suffix,
      description: 'Created by a browser test.',
      locationId: seedId('location:demo-estates:CDF'),
      impact: 2,
      urgency: 2,
      assigneeId: seedId('membership:demo-estates:technician'),
    },
  });
  expect(created.ok()).toBe(true);
  const job = (await created.json()) as { id: string };

  // The manager adds a checklist from the organisation's templates, which holds back completing the job.
  await page.goto('/app/work-orders/' + job.id);
  const checklists = page.getByRole('region', { name: 'Checklists', exact: true });
  await expect(checklists.getByText('No checklists on this job.')).toBeVisible();
  await checklists.getByLabel('Add from a template').selectOption({ label: 'Plant room repair' });
  await checklists.getByRole('button', { name: 'Add checklist' }).first().click();
  await expect(checklists.getByRole('heading', { name: 'Plant room repair' })).toBeVisible();
  await expect(checklists.getByText('4 required to answer')).toBeVisible();
  await assertAccessible(page);

  // The technician can't complete the job until the required steps are answered.
  await signInAs(page, 'technician');
  await page.goto('/app/work-orders/' + job.id);
  await expectStatus(page, 'Assigned');
  await updateStatus(page, 'On site');
  await expectStatus(page, 'On site');
  await updateStatus(page, 'Completed');
  await expect(page.getByRole('alert').filter({ hasText: 'required checklist steps before completing' })).toBeVisible();
  await expectStatus(page, 'On site');

  const list = page.getByRole('region', { name: 'Checklists', exact: true });
  await list.getByLabel(/^Risk assessment and RAMS acknowledged/).click();
  await expect(list.getByLabel(/^Risk assessment and RAMS acknowledged/)).toBeChecked();
  await expect(list.getByText('3 required to answer')).toBeVisible();
  await list.getByLabel(/^System isolated and made safe/).click();
  await expect(list.getByLabel(/^System isolated and made safe/)).toBeChecked();
  await list.getByLabel(/^Area left clean and tidy/).click();
  await expect(list.getByLabel(/^Area left clean and tidy/)).toBeChecked();
  await expect(list.getByText('1 required to answer')).toBeVisible();
  // A failed test is an answer, but it has to say what failed.
  await list.getByLabel(/^Pressure test after repair/).selectOption({ label: 'Fail' });
  await list.getByRole('button', { name: 'Save answer' }).nth(1).click();
  await expect(list.getByText('Say what failed.')).toBeVisible();
  await list.getByLabel('What failed: Pressure test after repair (2 hours)').fill('Pressure fell to 0.9 bar');
  await list.getByRole('button', { name: 'Save answer' }).nth(1).click();
  await expect(list.getByText('Complete', { exact: true })).toBeVisible();
  // A reading must be a number.
  await list.getByLabel(/^Pressure after repair/).fill('about one');
  await list.getByRole('button', { name: 'Save answer' }).first().click();
  await expect(list.getByText('Enter a number, for example 1.4.')).toBeVisible();
  await list.getByLabel(/^Pressure after repair/).fill('1.4');
  await list.getByRole('button', { name: 'Save answer' }).first().click();
  await expect(list.getByText('Answered by Tom Price').first()).toBeVisible();
  await updateStatus(page, 'Completed');
  await expectStatus(page, 'Completed');

  // A photo, with when it was taken and what it shows.
  const photos = page.getByRole('region', { name: 'Photos', exact: true });
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=',
    'base64',
  );
  await expect(photos.getByText('No photos on this job.')).toBeVisible();
  await photos.getByLabel('Choose a photo').setInputFiles({ name: 'repaired.png', mimeType: 'image/png', buffer: png });
  await photos.getByLabel('When was it taken?').selectOption({ label: 'After' });
  await photos.getByLabel('Caption (optional)').fill('Valve replaced');
  await photos.getByRole('button', { name: 'Add photo' }).click();
  await expect(photos.getByRole('img', { name: 'After photo: Valve replaced' })).toBeVisible();
  await expect(photos.getByText('Photo added.')).toBeVisible();

  // Both sign-offs are drawn. The technician's name is their own; the customer's is typed.
  const signoff = page.getByRole('region', { name: 'Sign-off', exact: true });
  const draw = async (form: ReturnType<typeof signoff.getByRole>) => {
    const pad = form.getByRole('img');
    const box = (await pad.boundingBox())!;
    await page.mouse.move(box.x + 20, box.y + 40);
    await page.mouse.down();
    await page.mouse.move(box.x + 120, box.y + 90, { steps: 8 });
    await page.mouse.move(box.x + 220, box.y + 30, { steps: 8 });
    await page.mouse.up();
  };
  const customer = signoff.getByRole('form', { name: 'Customer sign-off' });
  await customer.getByRole('button', { name: 'Save sign-off' }).click();
  await expect(customer.getByText('Draw a signature first.')).toBeVisible();
  await draw(customer);
  await customer.getByRole('button', { name: 'Save sign-off' }).click();
  await expect(customer.getByText('Enter the customer’s name.')).toBeVisible();
  await customer.getByLabel('Customer’s name').fill('Hana Patel');
  await customer.getByRole('button', { name: 'Save sign-off' }).click();
  await expect(signoff.getByRole('img', { name: 'Signature of Hana Patel' })).toBeVisible();
  const technician = signoff.getByRole('form', { name: 'Technician sign-off' });
  await draw(technician);
  await technician.getByRole('button', { name: 'Save sign-off' }).click();
  await expect(signoff.getByRole('img', { name: 'Signature of Tom Price' })).toBeVisible();
  await expect(signoff.getByRole('form')).toHaveCount(0);
  await assertAccessible(page);

  // The job sheet is a PDF. A technician has no costs on it and cannot email it.
  const sheet = page.getByRole('region', { name: 'Job sheet', exact: true });
  await expect(sheet.getByRole('link', { name: 'Download job sheet (PDF)' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Email to the requester' })).toHaveCount(0);
  const pdf = await page.request.get('/api/work-orders/' + job.id + '/job-sheet');
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()['content-type']).toContain('application/pdf');
  expect((await pdf.body()).subarray(0, 5).toString('latin1')).toBe('%PDF-');

  // The manager can email it, but this job did not come from a request, so there is no one to send it to.
  await signInAs(page, 'manager');
  await page.goto('/app/work-orders/' + job.id);
  const managerSheet = page.getByRole('region', { name: 'Job sheet', exact: true });
  await managerSheet.getByRole('button', { name: 'Email to the requester' }).click();
  await expect(managerSheet.getByRole('alert')).toContainText('no requester');
});
