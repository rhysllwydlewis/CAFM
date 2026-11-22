'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Checkbox, Field, TextInput } from '@cafm/ui';
import {
  WORK_ORDER_PAUSE_LABELS,
  WORK_ORDER_PAUSE_REASONS,
  WORK_ORDER_REASSIGNABLE,
  WORK_ORDER_STATUS_LABELS,
  type WorkOrderPauseReason,
  type WorkOrderRecord,
  type WorkOrderStatus,
} from '@cafm/shared';
import { helpdeskWrite } from '@/lib/helpdesk-client';
import { RecordPicker } from '../helpdesk/record-picker';
import styles from './work-orders.module.css';

const LEVELS = [
  ['1', 'High'],
  ['2', 'Medium'],
  ['3', 'Low'],
];

export function WorkOrderActions({
  record,
  canEdit,
  canAssign,
  canNote,
}: {
  record: WorkOrderRecord;
  canEdit: boolean;
  canAssign: boolean;
  canNote: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<WorkOrderStatus | ''>('');
  const [assignee, setAssignee] = useState(
    record.assigneeId && record.assigneeName ? { id: record.assigneeId, name: record.assigneeName } : null,
  );
  const base = '/work-orders/' + record.id;
  const open = record.status !== 'closed' && record.status !== 'cancelled';

  async function submit(event: FormEvent<HTMLFormElement>, run: (values: FormData) => Promise<unknown>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const form = event.currentTarget;
    try {
      await run(new FormData(form));
      form.reset();
      setStatus('');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save this change.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack g4">
      {record.nextStatuses.length > 0 && (
        <form
          className="stack g3"
          onSubmit={(event) =>
            void submit(event, (data) =>
              helpdeskWrite(base + '/status', {
                version: record.version,
                status,
                ...(status === 'paused' ? { pauseReason: data.get('pauseReason') } : {}),
                ...(data.get('note') ? { note: data.get('note') } : {}),
              }),
            )
          }
        >
          <h3 className="card-t">Update status</h3>
          <Field label="New status" htmlFor="wo-status">
            <select
              id="wo-status"
              className={styles.control}
              value={status}
              required
              onChange={(event) => setStatus(event.target.value as WorkOrderStatus | '')}
            >
              <option value="">Choose a status</option>
              {record.nextStatuses.map((next) => (
                <option key={next} value={next}>
                  {WORK_ORDER_STATUS_LABELS[next]}
                </option>
              ))}
            </select>
          </Field>
          {status === 'paused' && (
            <Field label="Why is it paused?" htmlFor="wo-pause">
              <select id="wo-pause" name="pauseReason" className={styles.control} required defaultValue="">
                <option value="">Choose a reason</option>
                {WORK_ORDER_PAUSE_REASONS.map((reason: WorkOrderPauseReason) => (
                  <option key={reason} value={reason}>
                    {WORK_ORDER_PAUSE_LABELS[reason]}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Note (optional)" htmlFor="wo-status-note">
            <textarea id="wo-status-note" name="note" className={styles.textarea} maxLength={1200} />
          </Field>
          <Button type="submit" disabled={busy || !status}>
            Update status
          </Button>
        </form>
      )}

      {canAssign && WORK_ORDER_REASSIGNABLE.includes(record.status) && (
        <form
          className="stack g3"
          onSubmit={(event) =>
            void submit(event, () =>
              helpdeskWrite(base + '/assign', { version: record.version, assigneeId: assignee?.id ?? null }),
            )
          }
        >
          <h3 className="card-t">Assign</h3>
          <RecordPicker
            label="Assignee"
            path={'/work-orders/locations/' + record.location.id + '/assignees'}
            value={assignee}
            onChange={setAssignee}
          />
          <Button type="submit" disabled={busy || (assignee?.id ?? null) === record.assigneeId}>
            Save assignment
          </Button>
        </form>
      )}

      {canEdit && open && (
        <details className="card card-b">
          <summary className="medium">Edit details and priority</summary>
          <form
            className="stack g3"
            onSubmit={(event) =>
              void submit(event, (data) =>
                helpdeskWrite(
                  base,
                  {
                    version: record.version,
                    title: data.get('title'),
                    description: data.get('description'),
                    impact: Number(data.get('impact')),
                    urgency: Number(data.get('urgency')),
                  },
                  'PATCH',
                ),
              )
            }
          >
            <Field label="Title" htmlFor="wo-title">
              <TextInput id="wo-title" name="title" defaultValue={record.title} required maxLength={160} />
            </Field>
            <Field label="Description" htmlFor="wo-description">
              <textarea
                id="wo-description"
                name="description"
                className={styles.textarea}
                defaultValue={record.description}
                required
                maxLength={6000}
              />
            </Field>
            <div className={styles.columns}>
              {(['impact', 'urgency'] as const).map((key) => (
                <Field key={key} label={key === 'impact' ? 'Impact' : 'Urgency'} htmlFor={'wo-' + key}>
                  <select id={'wo-' + key} name={key} className={styles.control} defaultValue={String(record[key])}>
                    {LEVELS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
              ))}
            </div>
            <p className="sm muted">
              Changing impact or urgency recalculates the priority and the response, attendance and fix targets.
            </p>
            <Button type="submit" disabled={busy}>
              Save details
            </Button>
          </form>
        </details>
      )}

      {canNote && record.status !== 'cancelled' && (
        <form
          className="stack g3"
          onSubmit={(event) =>
            void submit(event, (data) =>
              helpdeskWrite(base + '/comments', { body: data.get('comment'), internal: data.get('internal') === 'on' }),
            )
          }
        >
          <Field label="Add a note" htmlFor="wo-comment">
            <textarea id="wo-comment" name="comment" className={styles.textarea} required maxLength={6000} />
          </Field>
          <Checkbox label="Internal note" name="internal" />
          <Button icon="comment" type="submit" disabled={busy}>
            Add note
          </Button>
        </form>
      )}
      {message && (
        <p role="alert" className="field-error">
          {message}
        </p>
      )}
    </div>
  );
}
