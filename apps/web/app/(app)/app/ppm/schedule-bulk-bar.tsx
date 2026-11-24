'use client';

import { useId, useState, type FormEvent } from 'react';
import { Button } from '@cafm/ui';
import { PPM_PRIORITY_NAMES, type PpmAssigneeOption } from '@cafm/shared';
import { BulkOutcome, useBulk } from '@/components/bulk-selection';
import styles from './ppm.module.css';

type Action = 'archive' | 'restore' | 'assign' | 'unassign' | 'priority';
const ACTIONS: [Action, string][] = [
  ['archive', 'Archive'],
  ['restore', 'Restore'],
  ['assign', 'Give the jobs to'],
  ['unassign', 'Clear who gets the jobs'],
  ['priority', 'Set priority'],
];

/** What can be done to the ticked schedules. Each is still checked by the API, so a refused one is reported, not hidden. */
export function ScheduleBulkBar({ assignees }: { assignees: PpmAssigneeOption[] }) {
  const { selected, busy, run, outcome, error, setError } = useBulk();
  const id = useId();
  const [action, setAction] = useState<Action>('archive');
  const [assignee, setAssignee] = useState('');
  const [priority, setPriority] = useState('3');
  if (!selected.length && !outcome && !error) return null;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (action === 'assign' && !assignee) {
      setError('Choose who to give the jobs to.');
      return;
    }
    const body =
      action === 'archive' || action === 'restore'
        ? { action: 'active', active: action === 'restore' }
        : action === 'priority'
          ? { action, priority: Number(priority) }
          : { action: 'assign', assigneeId: action === 'assign' ? assignee : null };
    void run('/ppm/schedules/bulk', body, 'Could not change the schedules.');
  };
  return (
    <div className="card-b stack g3">
      {selected.length > 0 && (
        <form className="row wrap g2" onSubmit={submit} aria-label="Bulk actions">
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
          {action === 'assign' && (
            <label className="field" htmlFor={id + '-assignee'}>
              <span className="label">Person</span>
              <select
                id={id + '-assignee'}
                className={styles.control}
                value={assignee}
                onChange={(event) => setAssignee(event.target.value)}
              >
                <option value="">Choose…</option>
                {assignees.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name} ({person.role})
                  </option>
                ))}
              </select>
            </label>
          )}
          {action === 'priority' && (
            <label className="field" htmlFor={id + '-priority'}>
              <span className="label">Priority</span>
              <select
                id={id + '-priority'}
                className={styles.control}
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
              >
                {PPM_PRIORITY_NAMES.map((name, index) => (
                  <option key={name} value={index + 1}>
                    P{index + 1} {name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? 'Applying…' : 'Apply to ' + selected.length}
          </Button>
        </form>
      )}
      <BulkOutcome />
    </div>
  );
}
