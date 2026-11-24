'use client';

import { useId, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@cafm/ui';
import { REQUEST_STATUS_LABELS, type BulkRequestResponse, type RequestSummary } from '@cafm/shared';
import { helpdeskWrite } from '@/lib/helpdesk-client';
import { RecordPicker } from './record-picker';
import styles from './helpdesk.module.css';

type Action = 'status' | 'assign' | 'unassign' | 'priority';
const STATUSES = ['in_progress', 'completed', 'closed', 'rejected'] as const;
type Status = (typeof STATUSES)[number];
const LEVELS = [
  ['1', 'High'],
  ['2', 'Medium'],
  ['3', 'Low'],
];
const ACTIONS: [Action, string][] = [
  ['status', 'Change status'],
  ['assign', 'Assign to'],
  ['unassign', 'Clear assignee'],
  ['priority', 'Set priority'],
];

/** What can be done to the ticked requests. Each is still checked by the API, so a refused one is reported, not hidden. */
export function RequestBulkBar({
  selected,
  onDone,
}: {
  selected: RequestSummary[];
  /** Called with the ids that were changed, so the table can untick them. */
  onDone: (changed: string[]) => void;
}) {
  const router = useRouter();
  const id = useId();
  const [action, setAction] = useState<Action>('status');
  const [status, setStatus] = useState<Status>('in_progress');
  const [note, setNote] = useState('');
  const [assignee, setAssignee] = useState<{ id: string; name: string } | null>(null);
  const [impact, setImpact] = useState('2');
  const [urgency, setUrgency] = useState('2');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [outcome, setOutcome] = useState<{ response: BulkRequestResponse; numbers: Map<string, string> }>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selected.length || busy) return;
    if (action === 'assign' && !assignee) {
      setError('Choose who to assign the requests to.');
      return;
    }
    if (action === 'status' && status === 'rejected' && !note.trim()) {
      setError('Enter a reason for rejection.');
      return;
    }
    setBusy(true);
    setError('');
    const items = selected.map(({ id, version }) => ({ id, version }));
    const body =
      action === 'status'
        ? { action, items, status, ...(note.trim() ? { note: note.trim() } : {}) }
        : action === 'priority'
          ? { action, items, impact: Number(impact), urgency: Number(urgency) }
          : { action: 'assign', items, assigneeId: action === 'assign' ? assignee!.id : null };
    try {
      const response = await helpdeskWrite<BulkRequestResponse>('/helpdesk/requests/bulk', body);
      setOutcome({ response, numbers: new Map(selected.map((row) => [row.id, row.number])) });
      onDone(response.results.filter(({ ok }) => ok).map(({ id }) => id));
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not change the requests.');
    } finally {
      setBusy(false);
    }
  }

  const failures = outcome?.response.results.filter(({ ok }) => !ok) ?? [];
  // Nothing to show until a row is ticked or a result is waiting to be read.
  if (!selected.length && !outcome && !error) return null;
  return (
    <div className="card-b stack g3">
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
              {ACTIONS.map(([value, label]) => (
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
                  onChange={(event) => setStatus(event.target.value as Status)}
                >
                  {STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {REQUEST_STATUS_LABELS[value]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field" htmlFor={id + '-note'}>
                <span className="label">{status === 'rejected' ? 'Reason' : 'Note (optional)'}</span>
                <input
                  id={id + '-note'}
                  className={styles.control}
                  value={note}
                  maxLength={1200}
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
            </>
          )}
          {action === 'assign' && (
            <RecordPicker
              label="Assignee"
              path={'/helpdesk/requests/' + selected[0]!.id + '/assignees'}
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
          The people listed can work at the first selected request’s location. Anyone who can’t work at another
          request’s location is reported for that request.
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
