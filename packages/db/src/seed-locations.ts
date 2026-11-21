import type { PrismaClient } from '@prisma/client';
import { seedId } from './ids';

const locations = {
  'demo-estates': [
    ['EST', 'Demo Estates Ltd', 'portfolio', null],
    ['CYM', 'Wales region', 'region', 'EST'],
    ['CDF', 'Cardiff HQ', 'site', 'CYM'],
    ['CDF-B1', 'Basement', 'floor', 'CDF'],
    ['CDF-PLANT', 'Plant room B1', 'space', 'CDF-B1'],
    ['LLD', 'Llandaff Primary School', 'site', 'CYM'],
  ],
  'starter-demo': [['ST-WH', 'Starter warehouse', 'site', null]],
} as const;

export async function seedLocations(db: PrismaClient): Promise<void> {
  for (const [slug, rows] of Object.entries(locations)) {
    const tenantId = seedId(`tenant:${slug}`);
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`locations:${tenantId}`}))`;
      for (const [code, name, kind, parent] of rows) {
        const id = seedId(`location:${slug}:${code}`);
        if (await tx.location.findUnique({ where: { id }, select: { id: true } })) continue;
        const parentId = parent ? seedId(`location:${slug}:${parent}`) : null;
        await tx.location.create({ data: { id, tenantId, code, name, kind, parentId } });
        const parents = parentId
          ? await tx.locationPath.findMany({
              where: { tenantId, descendantId: parentId },
              select: { ancestorId: true },
            })
          : [];
        await tx.locationPath.createMany({
          data: [...parents, { ancestorId: id }].map(({ ancestorId }) => ({ tenantId, ancestorId, descendantId: id })),
        });
      }
      if (slug === 'demo-estates') {
        const grant = {
          tenantId,
          membershipId: seedId('membership:demo-estates:technician'),
          locationId: seedId('location:demo-estates:CDF'),
        };
        await tx.membershipSite.upsert({
          where: { tenantId_membershipId_locationId: grant },
          create: grant,
          update: {},
        });
      }
    });
  }
}
