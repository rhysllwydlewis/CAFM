import type { Checklist } from './work-order-forms';
import type { MobileMutationItem } from './mobile';
import type { MobilePackJob } from './mobile-sync';
import { WORK_ORDER_STATUS_LABELS, type WorkOrderStatus } from './work-orders';

/**
 * What the phone keeps until it has signal: changes made offline, in the order they were made.
 * A queued change is one of the mutation queue's kinds (sent to `POST /api/mobile/mutations`), a photo
 * (`PUT /api/work-orders/:id/photos`) or a signature (`POST /api/work-orders/:id/signatures`). The photo's
 * file is kept beside the entry by the app and is not part of this type.
 */
export type OutboxChange =
  | { type: 'mutation'; item: MobileMutationItem }
  | { type: 'photo'; phase: 'before' | 'after' | 'other'; caption: string | null; filename: string; bytes: number }
  | { type: 'signature'; role: 'customer' | 'technician'; signerName: string | null };

export type OutboxEntry = {
  /** Also the idempotency key for a mutation. Made on the phone. */
  id: string;
  /** Order made in, from 1. */
  seq: number;
  createdAt: string;
  workOrderId: string;
  /** `pending` waits for signal. `failed` was refused by the server and needs a person to look. */
  state: 'pending' | 'failed';
  message: string | null;
  change: OutboxChange;
};

const size = (n: number) =>
  n < 1024 * 1024 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (n / 1048576).toFixed(1) + ' MB';

/** One line for the "Waiting to sync" list. */
export function describeOutboxEntry(entry: OutboxEntry): string {
  const { change } = entry;
  if (change.type === 'photo') return `Photo (${size(change.bytes)})`;
  if (change.type === 'signature') return change.role === 'customer' ? 'Customer signature' : 'Technician signature';
  const { item } = change;
  switch (item.kind) {
    case 'status': {
      const status = item.payload.status as WorkOrderStatus;
      return 'Status → ' + (WORK_ORDER_STATUS_LABELS[status] ?? 'changed');
    }
    case 'note':
      return 'Note';
    case 'checklist_answer':
      return 'Checklist answer';
    case 'time':
      return 'Time entry';
    case 'meter_reading':
      return 'Meter reading';
  }
}

/**
 * The version a queued status change must carry. Each applied status change raises the job's version by one,
 * so a second change queued before the first has synced expects the job one version further on.
 */
export function nextStatusVersion(job: Pick<MobilePackJob, 'id' | 'version'>, queue: readonly OutboxEntry[]): number {
  const queued = queue.filter(
    (entry) =>
      entry.workOrderId === job.id &&
      entry.state === 'pending' &&
      entry.change.type === 'mutation' &&
      entry.change.item.kind === 'status',
  ).length;
  return job.version + queued;
}

/** The status the job will have once its queued status changes sync, so the phone shows what the person did. */
export function localStatus(job: Pick<MobilePackJob, 'id' | 'status'>, queue: readonly OutboxEntry[]): WorkOrderStatus {
  let status = job.status as WorkOrderStatus;
  for (const entry of queue) {
    if (entry.workOrderId !== job.id || entry.state !== 'pending' || entry.change.type !== 'mutation') continue;
    if (entry.change.item.kind === 'status') status = entry.change.item.payload.status as WorkOrderStatus;
  }
  return status;
}

/** The job's checklists with queued answers laid over them, so a step stays ticked after it is answered offline. */
export function localChecklists(
  job: Pick<MobilePackJob, 'id' | 'checklists'>,
  queue: readonly OutboxEntry[],
): Checklist[] {
  const lists = structuredClone(job.checklists as Checklist[]);
  for (const entry of queue) {
    if (entry.workOrderId !== job.id || entry.state !== 'pending' || entry.change.type !== 'mutation') continue;
    const { item } = entry.change;
    if (item.kind !== 'checklist_answer') continue;
    const step = lists.find((list) => list.id === item.checklistId)?.items.find((row) => row.id === item.itemId);
    if (!step) continue;
    step.answer = (item.payload.answer as string | null) ?? null;
    step.note = (item.payload.note as string | null | undefined) ?? null;
  }
  for (const list of lists) list.outstanding = list.items.filter((row) => row.required && !row.answer).length;
  return lists;
}

export type OutboxOutcome = 'done' | 'failed';

/** What to do with an entry after the server answered a mutation. An applied change is done. A refusal stays for a person. */
export function outboxOutcome(result: { status: 'applied' | 'rejected'; code?: string }): OutboxOutcome {
  return result.status === 'applied' ? 'done' : 'failed';
}

/** A person-readable reason for a refusal. */
export function outboxFailureMessage(code: string | undefined, message: string | undefined): string {
  if (code === 'conflict') return 'The job changed while you were offline. Sync, then do this again.';
  if (code === 'forbidden') return 'You can no longer do this on that job.';
  if (code === 'not_found') return 'That job is no longer yours.';
  return message || 'The server did not accept this change.';
}
