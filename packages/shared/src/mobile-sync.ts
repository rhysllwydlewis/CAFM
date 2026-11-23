import type { WorkOrderSummary } from './work-orders';

/** A job as the work pack sends it (the work order summary, plus what is needed to do the job offline). */
export type MobilePackJob = WorkOrderSummary & {
  version: number;
  description: string | null;
  scheduledFor: string | null;
  accessNotes: string | null;
  assetDetail: {
    make: string | null;
    model: string | null;
    serial: string | null;
    /** Empty when the person may not record readings. `rolloverAt` is the value the meter wraps at. */
    meters?: { id: string; name: string; unit: string; rolloverAt: string | null }[];
  } | null;
  checklists: unknown[];
};

export type MobileWorkPack = { syncToken: string; generatedAt: string; limit: number; jobs: MobilePackJob[] };
export type MobileChanges = { syncToken: string; generatedAt: string; jobs: MobilePackJob[]; jobIds: string[] };

/**
 * Applies a changes response to the jobs held on the phone. Changed jobs replace (or add to) the held ones,
 * and any held job that is not in `jobIds` is dropped: it was closed, cancelled or reassigned.
 * Returns the jobs in the order the server listed them in `jobIds`, so the phone shows priority order.
 */
export function applyMobileChanges(held: MobilePackJob[], changes: MobileChanges): MobilePackJob[] {
  const byId = new Map(held.map((job) => [job.id, job]));
  for (const job of changes.jobs) byId.set(job.id, job);
  return changes.jobIds.flatMap((id) => {
    const job = byId.get(id);
    return job ? [job] : [];
  });
}

/**
 * Job ids the server says the person holds that the phone has no job for after a merge. This happens when a
 * capped list moves an unchanged job into it. The phone then fetches the whole work pack instead of
 * saving a sync token that would hide the job.
 */
export function missingMobileJobIds(held: MobilePackJob[], changes: MobileChanges): string[] {
  const known = new Set([...held.map((job) => job.id), ...changes.jobs.map((job) => job.id)]);
  return changes.jobIds.filter((id) => !known.has(id));
}
