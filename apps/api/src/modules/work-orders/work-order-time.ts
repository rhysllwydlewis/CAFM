import type { Tx } from '@fmstead/db';
import { LABOUR_TYPES, timeCostMinor, type LabourType, type TimeEntry } from '@fmstead/shared';

/**
 * The hourly rate for a kind of labour: the rate set for the person's role, or else the one for everyone.
 * Null when the organisation hasn't set one, in which case the time is recorded without a cost.
 */
export async function rateFor(tx: Tx, tenantId: string, labourType: LabourType, roleKey: string) {
  const rows = await tx.labourRate.findMany({
    where: { tenantId, labourType, roleKey: { in: [roleKey, ''] } },
  });
  return rows.find((row) => row.roleKey === roleKey) ?? rows.find((row) => row.roleKey === '') ?? null;
}

const memberLabel = { select: { account: { select: { name: true } } } } as const;

/** A job's time. Rates and amounts are only in it for people who can see costs. */
export async function readTime(tx: Tx, tenantId: string, workOrderId: string, withCosts: boolean) {
  const rows = await tx.workOrderTime.findMany({
    where: { tenantId, workOrderId },
    include: { member: memberLabel, cost: { select: { amountMinor: true } } },
    orderBy: [{ workedOn: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  });
  const items: TimeEntry[] = rows.map((row) => ({
    id: row.id,
    labourType: row.labourType as LabourType,
    minutes: row.minutes,
    workedOn: row.workedOn.toISOString().slice(0, 10),
    note: row.note,
    recordedByName: row.member.account.name,
    createdAt: row.createdAt.toISOString(),
    ...(withCosts
      ? {
          rateMinor: row.rateMinor,
          amountMinor:
            row.cost[0]?.amountMinor ?? (row.rateMinor === null ? null : timeCostMinor(row.minutes, row.rateMinor)),
        }
      : {}),
  }));
  const byType = Object.fromEntries(LABOUR_TYPES.map((type) => [type, 0])) as Record<LabourType, number>;
  for (const row of rows) byType[row.labourType as LabourType] += row.minutes;
  return { totalMinutes: rows.reduce((total, row) => total + row.minutes, 0), byType, items };
}
