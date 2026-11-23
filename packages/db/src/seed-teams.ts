import type { PrismaClient } from '@prisma/client';
import { seedId } from './ids';
import { withTenant } from './index';

/** Demo teams for Demo Estates (doc 06): who works together, used for assignment and scoping. */
export async function seedTeams(db: PrismaClient): Promise<void> {
  const tenantId = seedId('tenant:demo-estates');
  const teams = [
    {
      key: 'helpdesk',
      name: 'Helpdesk and planning',
      description: 'Logs, triages and plans work.',
      members: ['helpdesk', 'planner'],
    },
    { key: 'field', name: 'Field engineers', description: 'Technicians on the road.', members: ['technician'] },
  ];
  await withTenant(db, tenantId, async (tx) => {
    for (const t of teams) {
      const id = seedId(`team:demo-estates:${t.key}`);
      await tx.team.upsert({
        where: { id },
        create: { id, tenantId, name: t.name, description: t.description },
        update: { name: t.name, description: t.description },
      });
      for (const m of t.members) {
        const membershipId = seedId(`membership:demo-estates:${m}`);
        await tx.teamMember.upsert({
          where: { tenantId_teamId_membershipId: { tenantId, teamId: id, membershipId } },
          create: { tenantId, teamId: id, membershipId },
          update: {},
        });
      }
    }
  });
}
