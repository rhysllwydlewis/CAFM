/**
 * Demo seed (doc 06). Runs as the owner role (DATABASE_URL). Idempotent:
 * re-running resets demo passwords and lockouts but keeps IDs stable.
 * Demo personas only; no real personal data.
 */
import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';
import { ALL_FEATURES, BUILTIN_ROLES, DEMO_PASSWORD, DEMO_PERSONAS, DEMO_TENANTS, FEATURES } from '@cafm/shared';
import { seedId } from './ids';
import { seedAssets } from './seed-assets';
import { seedLocations } from './seed-locations';
import { seedHelpdesk } from './seed-helpdesk';
import { seedWorkOrders } from './seed-workorders';

/**
 * Seeds (or refreshes) the built-in roles for one tenant. Custom roles are left
 * alone. With reset, every built-in role goes back to its default.
 */
export async function seedRoles(db: PrismaClient, tenantId: string, reset = false): Promise<void> {
  for (const r of BUILTIN_ROLES) {
    const data = { name: r.name, description: r.description, permissions: [...r.permissions], scope: r.scope };
    await db.role.upsert({
      where: { tenantId_key: { tenantId, key: r.key } },
      create: { id: seedId(`role:${tenantId}:${r.key}`), tenantId, key: r.key, builtin: true, ...data },
      // Only the Super User role is reset on every seed; other built-ins are editable per tenant.
      update: reset || r.key === 'super_user' ? data : {},
    });
  }
}

export async function seed(db: PrismaClient): Promise<void> {
  const passwordHash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });

  for (const t of DEMO_TENANTS) {
    const id = seedId(`tenant:${t.slug}`);
    await db.tenant.upsert({
      where: { id },
      create: { id, slug: t.slug, name: t.name, plan: t.plan, demo: true },
      update: { name: t.name, plan: t.plan, status: 'active', demo: true },
    });
    await seedRoles(db, id);
  }

  // A few custom fields, so forms show the configuration engine at work (doc 06 demo data).
  const demoFields = [
    {
      entityType: 'work_order',
      key: 'cost_code',
      label: 'Cost code',
      type: 'text',
      required: false,
      helpText: 'Finance cost centre, e.g. CC-1042',
    },
    {
      entityType: 'asset',
      key: 'criticality',
      label: 'Criticality',
      type: 'picklist',
      required: false,
      options: [
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
      ],
    },
    { entityType: 'asset', key: 'warranty_expires', label: 'Warranty expires', type: 'date', required: false },
  ];
  for (const [i, f] of demoFields.entries()) {
    const tenantId = seedId('tenant:demo-estates');
    await db.fieldDefinition.upsert({
      where: { tenantId_entityType_key: { tenantId, entityType: f.entityType, key: f.key } },
      create: { id: seedId(`field:${f.entityType}:${f.key}`), tenantId, position: i, ...f },
      update: { ...f, active: true },
    });
  }

  // Demo Estates Ltd shows everything: Enterprise plus every add-on (doc 06).
  const demo = seedId('tenant:demo-estates');
  const addons = ALL_FEATURES.filter((f) => 'addon' in FEATURES[f]);
  for (const feature of addons) {
    await db.tenantEntitlement.upsert({
      where: { tenantId_feature: { tenantId: demo, feature } },
      create: { tenantId: demo, feature, enabled: true, source: 'addon' },
      update: { enabled: true },
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
  await seedLocations(db);
  await seedAssets(db);
  await seedHelpdesk(db);
  await seedWorkOrders(db);
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
