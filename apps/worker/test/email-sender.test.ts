import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { PrismaClient } from '@cafm/db';

const { sendMail } = vi.hoisted(() => ({ sendMail: vi.fn() }));
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail }) } }));

const owner = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
const db = new PrismaClient({ datasourceUrl: process.env.APP_DATABASE_URL });
const ctx = (tenantId: string | null) => ({ db, tenantId, messageId: 'm1', log: () => undefined });
const email = { to: 'a@test.example', subject: 'Hello', text: 'Body' };

beforeAll(() => {
  process.env.SMTP_URL = 'smtp://localhost:1025';
  process.env.MAIL_FROM = 'FM Stead <no-reply@fmstead.invalid>';
});
afterAll(async () => {
  await owner.$disconnect();
  await db.$disconnect();
});

it("sends from the organisation's sender name on the platform's address, and from the standard sender otherwise", async () => {
  const { sendEmail } = await import('../src/jobs/email');
  const tenant = await owner.tenant.create({
    data: { slug: 'sender-test-' + randomUUID(), name: 'Sender test', plan: 'enterprise' },
  });
  const other = await owner.tenant.create({
    data: { slug: 'sender-other-' + randomUUID(), name: 'Sender other', plan: 'enterprise' },
  });
  try {
    await sendEmail(email, ctx(tenant.id));
    expect(sendMail.mock.calls.at(-1)![0].from).toBe('FM Stead <no-reply@fmstead.invalid>');

    await owner.tenantBranding.create({ data: { tenantId: tenant.id, senderName: 'Acme facilities' } });
    await sendEmail(email, ctx(tenant.id));
    expect(sendMail.mock.calls.at(-1)![0].from).toEqual({
      name: 'Acme facilities',
      address: 'no-reply@fmstead.invalid',
    });

    // A plan without branding stops the saved name applying.
    await owner.tenant.update({ where: { id: tenant.id }, data: { plan: 'starter' } });
    await sendEmail(email, ctx(tenant.id));
    expect(sendMail.mock.calls.at(-1)![0].from).toBe('FM Stead <no-reply@fmstead.invalid>');

    // Another organisation's name is never used, and platform mail (no tenant) is always the standard sender.
    await sendEmail(email, ctx(other.id));
    expect(sendMail.mock.calls.at(-1)![0].from).toBe('FM Stead <no-reply@fmstead.invalid>');
    await sendEmail(email, ctx(null));
    expect(sendMail.mock.calls.at(-1)![0].from).toBe('FM Stead <no-reply@fmstead.invalid>');
  } finally {
    await owner.tenantBranding.deleteMany({ where: { tenantId: tenant.id } });
    await owner.tenant.deleteMany({ where: { id: { in: [tenant.id, other.id] } } });
  }
});
