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
  await expect(page.getByText('Logged', { exact: true }).first()).toBeVisible();

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
  await expect(page.getByText('Accepted', { exact: true }).first()).toBeVisible();
  await updateStatus(page, 'On site');
  await expect(page.getByText('On site', { exact: true }).first()).toBeVisible();
  await updateStatus(page, 'Paused', { reason: 'Awaiting parts' });
  await expect(page.getByText('Paused · Awaiting parts').first()).toBeVisible();
  await updateStatus(page, 'On site');
  await expect(page.getByText('On site', { exact: true }).first()).toBeVisible();
  await page.getByLabel('Add a note').fill('Seal replaced and pressure tested.');
  await page.getByRole('button', { name: 'Add note' }).click();
  await expect(page.getByText('Seal replaced and pressure tested.')).toBeVisible();
  await updateStatus(page, 'Completed');
  await expect(page.getByText('Completed', { exact: true }).first()).toBeVisible();
  // Only someone who can edit work orders can verify it.
  await expect(page.getByLabel('New status').getByRole('option', { name: 'Verified' })).toHaveCount(0);

  await signInAs(page, 'helpdesk');
  await page.goto(url);
  await updateStatus(page, 'Verified');
  await expect(page.getByText('Verified', { exact: true }).first()).toBeVisible();
  await updateStatus(page, 'Closed');
  await expect(page.getByText('Closed', { exact: true }).first()).toBeVisible();
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
    await expect(contractor.getByText('Accepted', { exact: true }).first()).toBeVisible();
    await step('I’m on site');
    await expect(contractor.getByText('On site', { exact: true }).first()).toBeVisible();
    await contractor.getByLabel('Add a note').fill('Driver replaced, testing now.');
    await contractor.getByRole('button', { name: 'Add note' }).click();
    await expect(contractor.getByText('Driver replaced, testing now.')).toBeVisible();
    await step('Job complete');
    await expect(contractor.getByText('Completed', { exact: true }).first()).toBeVisible();
    await expect(contractor.getByLabel('What’s next?')).toHaveCount(0);
    await assertAccessible(contractor);
    await contractor.goto('/job/not-a-real-token');
    await expect(contractor.getByRole('heading', { name: 'This link isn’t valid' })).toBeVisible();

    // The team sees what the contractor did.
    await page.reload();
    await expect(page.getByText('Completed', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Driver replaced, testing now.')).toBeVisible();
    await expect(page.getByText('Sparks Electrical Ltd').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Take the job back' })).toHaveCount(0);
  } finally {
    await outside.close();
    await db.$disconnect();
  }
});
