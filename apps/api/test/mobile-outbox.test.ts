import { describe, expect, it } from 'vitest';
import {
  describeOutboxEntry,
  localChecklists,
  localStatus,
  nextStatusVersion,
  outboxFailureMessage,
  outboxOutcome,
  type MobilePackJob,
  type OutboxEntry,
} from '@cafm/shared';

const JOB = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const CHECKLIST = '33333333-3333-4333-8333-333333333333';
const STEP = '44444444-4444-4444-8444-444444444444';

let seq = 0;
const entry = (workOrderId: string, change: OutboxEntry['change'], state: OutboxEntry['state'] = 'pending') =>
  ({ id: 'e' + ++seq, seq, createdAt: 't', workOrderId, state, message: null, change }) as OutboxEntry;
const status = (workOrderId: string, to: string, state: OutboxEntry['state'] = 'pending') =>
  entry(
    workOrderId,
    { type: 'mutation', item: { key: 'k', kind: 'status', workOrderId, payload: { status: to } } },
    state,
  );
const answer = (workOrderId: string, value: string | null) =>
  entry(workOrderId, {
    type: 'mutation',
    item: {
      key: 'k',
      kind: 'checklist_answer',
      workOrderId,
      checklistId: CHECKLIST,
      itemId: STEP,
      payload: { answer: value },
    },
  });
const job = {
  id: JOB,
  version: 4,
  status: 'accepted',
  checklists: [
    {
      id: CHECKLIST,
      title: 'Boiler check',
      gate: 'completion',
      outstanding: 1,
      items: [{ id: STEP, label: 'Pressure', kind: 'number', required: true, answer: null, note: null }],
    },
  ],
} as unknown as MobilePackJob;

describe('queued status changes', () => {
  it('shows the status the person chose, ignoring other jobs and refused changes', () => {
    const queue = [status(JOB, 'on_site'), status(OTHER, 'paused'), status(JOB, 'paused', 'failed')];
    expect(localStatus(job, queue)).toBe('on_site');
    expect(localStatus(job, [])).toBe('accepted');
  });

  it('expects each queued status change to raise the version by one', () => {
    expect(nextStatusVersion(job, [])).toBe(4);
    expect(nextStatusVersion(job, [status(JOB, 'on_site'), status(OTHER, 'paused'), status(JOB, 'completed')])).toBe(6);
  });
});

describe('localChecklists', () => {
  it('lays a queued answer over the saved checklist and counts what is outstanding', () => {
    const lists = localChecklists(job, [answer(JOB, '1.4')]);
    expect(lists[0]!.items[0]!.answer).toBe('1.4');
    expect(lists[0]!.outstanding).toBe(0);
  });

  it('does not change the saved job, and ignores answers for other jobs', () => {
    localChecklists(job, [answer(JOB, '1.4')]);
    expect((job.checklists[0] as { items: { answer: string | null }[] }).items[0]!.answer).toBeNull();
    expect(localChecklists(job, [answer(OTHER, '1.4')])[0]!.outstanding).toBe(1);
  });

  it('a later cleared answer wins', () => {
    expect(localChecklists(job, [answer(JOB, '1.4'), answer(JOB, null)])[0]!.outstanding).toBe(1);
  });
});

describe('describing and settling entries', () => {
  it('describes each kind in one line', () => {
    expect(describeOutboxEntry(status(JOB, 'completed'))).toBe('Status → Completed');
    expect(describeOutboxEntry(answer(JOB, '1'))).toBe('Checklist answer');
    expect(
      describeOutboxEntry(
        entry(JOB, { type: 'photo', phase: 'after', caption: null, filename: 'a.jpg', bytes: 2.5 * 1048576 }),
      ),
    ).toBe('Photo (2.5 MB)');
    expect(describeOutboxEntry(entry(JOB, { type: 'signature', role: 'customer', signerName: 'A' }))).toBe(
      'Customer signature',
    );
    expect(
      describeOutboxEntry(
        entry(JOB, {
          type: 'mutation',
          item: { key: '22222222-2222-4222-8222-222222222222', kind: 'quick_job', payload: { title: 'Loose guard' } },
        }),
      ),
    ).toBe('New job: Loose guard');
  });

  it('removes an applied change and keeps a refused one for a person', () => {
    expect(outboxOutcome({ status: 'applied' })).toBe('done');
    expect(outboxOutcome({ status: 'rejected', code: 'conflict' })).toBe('failed');
  });

  it('explains a refusal in plain words', () => {
    expect(outboxFailureMessage('conflict', undefined)).toMatch(/changed while you were offline/);
    expect(outboxFailureMessage('invalid', 'Enter a number.')).toBe('Enter a number.');
  });
});
