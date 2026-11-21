/**
 * Demo seed (doc 06). Runs as the owner role (DATABASE_URL). Idempotent:
 * re-running resets demo passwords and lockouts but keeps IDs stable.
 * Demo personas only; no real personal data.
 */
import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import { DEMO_PASSWORD, DEMO_PERSONAS, DEMO_TENANTS } from '@cafm/shared';
import { seedId } from './ids';

export async function seed(db: PrismaClient): Promise<void> {
  const passwordHash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });

  for (const t of DEMO_TENANTS) {
    const id = seedId(`tenant:${t.slug}`);
    await db.tenant.upsert({
      where: { id },
      create: { id, slug: t.slug, name: t.name, plan: t.plan },
      update: { name: t.name, plan: t.plan, status: 'active' },
    });
  }

  for (const p of DEMO_PERSONAS) {
    const accountId = seedId(`account:${p.key}`);
    const tenantId = seedId(`tenant:${p.tenant}`);
    await db.account.upsert({
      where: { id: accountId },
      create: { id: accountId, email: p.email, name: p.name, passwordHash, isDemo: true },
      update: { email: p.email, name: p.name, passwordHash, failedAttempts: 0, lockedUntil: null },
    });
    const membershipId = seedId(`membership:${p.tenant}:${p.key}`);
    const data = { role: p.role, licence: p.licence, title: p.description, landingPage: p.landingPage };
    await db.membership.upsert({
      where: { id: membershipId },
      create: { id: membershipId, tenantId, accountId, ...data },
      update: { ...data, status: 'active' },
    });
  }
}

if (require.main === module) {
  const db = new PrismaClient();
  seed(db)
    .then(() => console.log(`Seeded ${DEMO_TENANTS.length} tenants and ${DEMO_PERSONAS.length} demo personas`))
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => db.$disconnect());
}
