'use client';

import { useId, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@fmstead/ui';
import {
  WORK_ORDER_PAUSE_LABELS,
  WORK_ORDER_PAUSE_REASONS,
  WORK_ORDER_STATUS_LABELS,
  WORK_ORDER_STATUSES,
  type BulkWorkOrderResponse,
  type WorkOrderPauseReason,
  type WorkOrderStatus,
  type WorkOrderSummary,
} from '@fmstead/shared';
import { helpdeskWrite } from '@/lib/helpdesk-client';
import { RecordPicker } from '../helpdesk/record-picker';
import styles from './work-orders.module.css';

type Action = 'status' | 'assign' | 'unassign' | 'priority';
const LEVELS = [
  ['1', 'High'],
  ['2', 'Medium'],
  ['3', 'Low'],
];

/** What can be done to the ticked rows. Each row is still checked by the API, so a refused one is reported, not hidden. */
export function WorkOrderBulkBar({
  selected,
  permissions,
  onDone,
}: {
  selected: WorkOrderSummary[];
  permissions: readonly string[];
  /** Called with the ids that were changed, so the table can untick them. */
  onDone: (changed: string[]) => void;
}) {
  const router = useRouter();
  const id = useId();
  const canStatus = permissions.includes('work_orders.edit') || permissions.includes('work_orders.close');
  const canEdit = permissions.includes('work_orders.edit');
  const canAssign = permissions.includes('work_orders.assign');
  const actions = [
    ...(canStatus ? [['status', 'Change status'] as const] : []),
    ...(canAssign ? [['assign', 'Assign to'] as const, ['unassign', 'Clear assignee'] as const] : []),
    ...(canEdit ? [['priority', 'Set priority'] as const] : []),
  ];
  const [action, setAction] = useState<Action>(actions[0]?.[0] ?? 'status');
  const [status, setStatus] = useState<WorkOrderStatus>('assigned');
  const [reason, setReason] = useState<WorkOrderPauseReason>(WORK_ORDER_PAUSE_REASONS[0]!);
  const [assignee, setAssignee] = useState<{ id: string; name: string } | null>(null);
  const [impact, setImpact] = useState('2');
  const [urgency, setUrgency] = useState('2');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [outcome, setOutcome] = useState<{ response: BulkWorkOrderResponse; numbers: Map<string, string> }>();
  if (!actions.length) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected.length || busy) return;
    if (action === 'assign' && !assignee) {
      setError('Choose who to assign the work orders to.');
      return;
    }
    setBusy(true);
    setError('');
    const items = selected.map(({ id, version }) => ({ id, version }));
    const body =
      action === 'status'
        ? { action, items, status, ...(status === 'paused' ? { pauseReason: reason } : {}) }
        : action === 'priority'
          ? { action, items, impact: Number(impact), urgency: Number(urgency) }
          : { action: 'assign', items, assigneeId: action === 'assign' ? assignee!.id : null };
    try {
      const response = await helpdeskWrite<BulkWorkOrderResponse>('/work-orders/bulk', body);
      setOutcome({ response, numbers: new Map(selected.map((row) => [row.id, row.number])) });
      onDone(response.results.filter(({ ok }) => ok).map(({ id }) => id));
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not change the work orders.');
    } finally {
      setBusy(false);
    }
  }

  const failures = outcome?.response.results.filter(({ ok }) => !ok) ?? [];
  // Nothing to show until a row is ticked or a result is waiting to be read.
  if (!selected.length && !outcome && !error) return null;
  return (
    <div className={'card-b stack g3 ' + styles.bulk}>
      {selected.length > 0 && (
        <form className={styles.filters} onSubmit={(event) => void submit(event)} aria-label="Bulk actions">
          <strong>{selected.length} selected</strong>
          <label className="field" htmlFor={id + '-action'}>
            <span className="label">Action</span>
            <select
              id={id + '-action'}
              className={styles.control}
              value={action}
              onChange={(event) => setAction(event.target.value as Action)}
            >
              {actions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {action === 'status' && (
            <>
              <label className="field" htmlFor={id + '-status'}>
                <span className="label">New status</span>
                <select
                  id={id + '-status'}
                  className={styles.control}
                  value={status}
                  onChange={(event) => setStatus(event.target.value as WorkOrderStatus)}
                >
                  {WORK_ORDER_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {WORK_ORDER_STATUS_LABELS[value]}
                    </option>
                  ))}
                </select>
              </label>
              {status === 'paused' && (
                <label className="field" htmlFor={id + '-reason'}>
                  <span className="label">Why paused</span>
                  <select
                    id={id + '-reason'}
                    className={styles.control}
                    value={reason}
                    onChange={(event) => setReason(event.target.value as WorkOrderPauseReason)}
                  >
                    {WORK_ORDER_PAUSE_REASONS.map((value) => (
                      <option key={value} value={value}>
                        {WORK_ORDER_PAUSE_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}
          {action === 'assign' && (
            <RecordPicker
              label="Assignee"
              path={'/work-orders/locations/' + selected[0]!.location.id + '/assignees'}
              value={assignee}
              onChange={setAssignee}
              required
            />
          )}
          {action === 'priority' &&
            (
              [
                ['Impact', impact, setImpact],
                ['Urgency', urgency, setUrgency],
              ] as const
            ).map(([label, value, set]) => (
              <label className="field" key={label} htmlFor={id + label}>
                <span className="label">{label}</span>
                <select
                  id={id + label}
                  className={styles.control}
                  value={value}
                  onChange={(event) => set(event.target.value)}
                >
                  {LEVELS.map(([level, text]) => (
                    <option key={level} value={level}>
                      {text}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          <Button type="submit" disabled={busy}>
            {busy ? 'Applying…' : 'Apply to ' + selected.length}
          </Button>
        </form>
      )}
      {action === 'assign' && selected.length > 0 && (
        <p className="sm muted">
          The people listed can work at the first selected job’s site. Anyone who can’t work at another job’s site is
          reported for that job.
        </p>
      )}
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      {outcome && (
        <div role="status" className="stack g2">
          <p>
            {outcome.response.succeeded} changed
            {outcome.response.failed ? ', ' + outcome.response.failed + ' not changed' : ''}.
          </p>
          {failures.length > 0 && (
            <ul className="sm">
              {failures.map((row) => (
                <li key={row.id}>
                  <span className="ref">{outcome.numbers.get(row.id) ?? row.id}</span>: {row.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
