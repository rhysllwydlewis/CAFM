import type { PrismaClient } from '@prisma/client';
import { seedId } from './ids';

const minutes = (from: Date, offset: number) => new Date(from.getTime() + offset * 60_000);

/**
 * Demo jobs for Demo Estates: one raised from a Helpdesk request, one with the boiler, and a
 * spread of statuses so the list and board have something to show. The technician works at Cardiff HQ.
 */
export async function seedWorkOrders(db: PrismaClient): Promise<void> {
  const slug = 'demo-estates';
  const tenantId = seedId('tenant:' + slug);
  const technician = seedId('membership:demo-estates:technician');
  const desk = seedId('membership:demo-estates:helpdesk');
  const now = new Date();
  const boiler = await db.asset.findFirst({
    where: { tenantId, name: { contains: 'Boiler 2' } },
    select: { id: true },
  });
  const location = (code: string) => seedId(`location:${slug}:${code}`);

  const jobs = [
    {
      number: 'WO-10412',
      title: 'Boiler 2 losing pressure overnight',
      description:
        'Pressure drops from 1.4 to 0.6 bar overnight. Check the expansion vessel and pressure relief valve.',
      status: 'on_site',
      priority: 2,
      location: 'CDF-PLANT',
      asset: boiler?.id ?? null,
      assignee: technician,
      age: 300,
      attended: true,
    },
    {
      number: 'WO-10411',
      title: 'Lights flickering near reception',
      description: 'The lights above the reception desk flicker. Replace the failing driver.',
      status: 'completed',
      priority: 3,
      location: 'CDF',
      request: 'REQ-10480',
      assignee: technician,
      age: 180,
      attended: true,
      completed: true,
    },
    {
      number: 'WO-10410',
      title: 'Meeting room heating off',
      description: 'No heating in the first-floor meeting room. Check the zone valve and thermostat.',
      status: 'logged',
      priority: 2,
      location: 'BRS',
      request: 'REQ-10481',
      assignee: null,
      age: 45,
    },
    {
      number: 'WO-10409',
      title: 'Replace worn door closer on the main entrance',
      description: 'The closer no longer returns the door fully. Replace it.',
      status: 'accepted',
      priority: 4,
      location: 'CDF',
      assignee: technician,
      age: 1500,
    },
    {
      number: 'WO-10408',
      title: 'Pump seal weeping in plant room',
      description: 'The circulation pump is weeping at the seal. Replace the seal kit.',
      status: 'paused',
      pause: 'awaiting_parts',
      priority: 3,
      location: 'CDF-PLANT',
      assignee: technician,
      age: 2900,
      attended: true,
    },
  ] as const;

  for (const job of jobs) {
    const id = seedId('work-order:demo-estates:' + job.number);
    const createdAt = minutes(now, -job.age);
    const request = 'request' in job ? job.request : null;
    await db.workOrder.upsert({
      where: { id },
      update: {},
      create: {
        id,
        tenantId,
        number: job.number,
        title: job.title,
        description: job.description,
        status: job.status,
        pauseReason: 'pause' in job ? job.pause : null,
        // Paused for parts, so the SLA clock is stopped.
        slaPausedAt: 'pause' in job ? minutes(now, -600) : null,
        locationId: location(job.location),
        assetId: 'asset' in job ? job.asset : null,
        requestId: request ? seedId(`request:${slug}:${request}`) : null,
        assigneeId: job.assignee,
        createdById: desk,
        impact: job.priority <= 2 ? 1 : 2,
        urgency: job.priority <= 2 ? 1 : 2,
        priority: job.priority,
        responseDueAt: minutes(createdAt, 60),
        attendDueAt: minutes(createdAt, 240),
        fixDueAt: minutes(createdAt, job.priority <= 2 ? 480 : 1440),
        firstResponseAt: job.assignee ? minutes(createdAt, 10) : null,
        attendedAt: 'attended' in job ? minutes(createdAt, 90) : null,
        completedAt: 'completed' in job ? minutes(createdAt, 150) : null,
        submissionKey: 'demo:' + job.number,
        submissionHash: 'demo-seed',
        createdAt,
        entries: {
          create: [
            {
              kind: 'status',
              body: request ? 'Raised from a Helpdesk request' : 'Work order raised',
              authorId: desk,
              createdAt,
            },
            ...(job.assignee
              ? [
                  {
                    kind: 'assignment',
                    body: 'Assigned to Tom Price',
                    authorId: desk,
                    createdAt: minutes(createdAt, 10),
                  },
                ]
              : []),
            ...('attended' in job
              ? [{ kind: 'status', body: 'On site', authorId: technician, createdAt: minutes(createdAt, 90) }]
              : []),
            ...('completed' in job
              ? [{ kind: 'status', body: 'Completed', authorId: technician, createdAt: minutes(createdAt, 150) }]
              : []),
          ],
        },
      },
    });
  }
}
