import type { PrismaClient } from '@prisma/client';
import { seedId } from './ids';

export async function seedHelpdesk(db: PrismaClient): Promise<void> {
  const types = [
    {
      key: 'leak',
      name: 'Water leak',
      category: 'Plumbing',
      problemCode: 'Leak',
      questions: [
        {
          key: 'near_electrics',
          label: 'Is water near electrical equipment?',
          required: true,
          yesImpact: 1,
          yesUrgency: 1,
        },
      ],
    },
    {
      key: 'comfort',
      name: 'Too hot or cold',
      category: 'Heating and ventilation',
      problemCode: 'Temperature',
      questions: [],
    },
    { key: 'lighting', name: 'Lighting fault', category: 'Electrical', problemCode: 'Lighting', questions: [] },
    { key: 'cleaning', name: 'Cleaning request', category: 'Cleaning', problemCode: 'Reactive', questions: [] },
    { key: 'other', name: 'Other fault', category: 'General', problemCode: 'Other', questions: [] },
  ];
  for (const slug of ['demo-estates', 'starter-demo']) {
    const tenantId = seedId('tenant:' + slug);
    for (const { key, ...type } of types) {
      const id = seedId('request-type:' + slug + ':' + key);
      await db.requestType.upsert({ where: { id }, create: { id, tenantId, ...type }, update: {} });
    }
  }

  const slug = 'demo-estates';
  const tenantId = seedId('tenant:' + slug);
  const requesterId = seedId('membership:demo-estates:requester');
  const assigneeId = seedId('membership:demo-estates:helpdesk');
  const now = new Date();
  const examples = [
    {
      number: 'REQ-10482',
      title: 'Water leaking under the sink',
      description: 'Water is pooling under the kitchen sink.',
      type: 'leak',
      code: 'CDF',
      status: 'new',
      channel: 'qr',
      priority: 1,
      age: 20,
    },
    {
      number: 'REQ-10481',
      title: 'No heating in the meeting room',
      description: 'The heating is off in the meeting room.',
      type: 'comfort',
      code: 'BRS',
      status: 'assigned',
      channel: 'portal',
      priority: 2,
      age: 50,
    },
    {
      number: 'REQ-10480',
      title: 'Lights flickering near reception',
      description: 'The lights above the reception desk need attention.',
      type: 'lighting',
      code: 'CDF',
      status: 'completed',
      channel: 'phone',
      priority: 3,
      age: 120,
    },
  ];
  for (const { type, code, age, ...item } of examples) {
    const id = seedId('request:demo-estates:' + item.number);
    const createdAt = new Date(now.getTime() - age * 60_000);
    await db.serviceRequest.upsert({
      where: { id },
      update: {},
      create: {
        id,
        tenantId,
        requesterId,
        ...item,
        createdAt,
        locationId: seedId('location:demo-estates:' + code),
        typeId: seedId('request-type:demo-estates:' + type),
        assigneeId: item.status === 'new' ? null : assigneeId,
        impact: item.priority === 1 ? 1 : 2,
        urgency: item.priority === 1 ? 1 : 2,
        responseDueAt: new Date(createdAt.getTime() + 30 * 60_000),
        firstResponseAt: item.status === 'new' ? null : new Date(createdAt.getTime() + 8 * 60_000),
        submissionKey: 'demo:' + item.number,
        submissionHash: 'demo-seed',
        entries: {
          create: [
            { kind: 'status', body: 'Request received', createdAt },
            ...(item.status === 'new'
              ? []
              : [
                  {
                    kind: 'status',
                    body: item.status === 'completed' ? 'Completed' : 'Assigned',
                    authorId: assigneeId,
                    createdAt: new Date(createdAt.getTime() + 8 * 60_000),
                  },
                ]),
          ],
        },
      },
    });
  }
  const notificationId = seedId('notice:demo-estates:helpdesk-completed');
  await db.notification.upsert({
    where: { id: notificationId },
    update: {},
    create: {
      id: notificationId,
      tenantId,
      recipientId: requesterId,
      eventKey: 'demo:helpdesk-completed',
      requestId: seedId('request:demo-estates:REQ-10480'),
      title: 'Request REQ-10480 completed',
      body: 'The lights near reception have been fixed. You can rate this job.',
    },
  });
}
