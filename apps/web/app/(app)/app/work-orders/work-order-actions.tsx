'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Checkbox, Field, TextInput } from '@fmstead/ui';
import {
  WORK_ORDER_PAUSE_LABELS,
  WORK_ORDER_PAUSE_REASONS,
  WORK_ORDER_REASSIGNABLE,
  SLA_PAUSING_REASONS,
  WORK_ORDER_UNASSIGNABLE,
  WORK_ORDER_STATUS_LABELS,
  type WorkOrderPauseReason,
  type WorkOrderRecord,
  type WorkOrderStatus,
} from '@fmstead/shared';
import { helpdeskWrite } from '@/lib/helpdesk-client';
import { requestTime } from '@/lib/helpdesk-format';
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
  const [reason, setReason] = useState<WorkOrderPauseReason | ''>('');
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
      setReason('');
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
              <select
                id="wo-pause"
                name="pauseReason"
                className={styles.control}
                required
                value={reason}
                onChange={(event) => setReason(event.target.value as WorkOrderPauseReason | '')}
              >
                <option value="">Choose a reason</option>
                {WORK_ORDER_PAUSE_REASONS.map((reason: WorkOrderPauseReason) => (
                  <option key={reason} value={reason}>
                    {WORK_ORDER_PAUSE_LABELS[reason]}
                  </option>
                ))}
              </select>
              {reason && (
                <small className="muted">
                  {SLA_PAUSING_REASONS.includes(reason)
                    ? 'This stops the SLA clock. The targets move out by the business time lost.'
                    : 'The SLA clock keeps running for this reason.'}
                </small>
              )}
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

      {canAssign && (WORK_ORDER_REASSIGNABLE.includes(record.status) || record.contractor) && (
        <section className="stack g3" aria-labelledby="wo-contractor">
          <h3 className="card-t" id="wo-contractor">
            Contractor
          </h3>
          {record.contractor && (
            <p className="sm">
              With {record.contractor.name} ({record.contractor.email}).{' '}
              {new Date(record.contractor.expiresAt).getTime() <= Date.now()
                ? 'Their link expired on ' + requestTime(record.contractor.expiresAt) + '. Send it again to renew it'
                : 'Their link works until ' + requestTime(record.contractor.expiresAt)}
              {record.contractor.lastUsedAt ? ' and was last used ' + requestTime(record.contractor.lastUsedAt) : ''}.
            </p>
          )}
          {WORK_ORDER_REASSIGNABLE.includes(record.status) && (
            <form
              className="stack g3"
              key={record.contractor?.email ?? 'none'}
              onSubmit={(event) =>
                void submit(event, (data) =>
                  helpdeskWrite(base + '/contractor', {
                    version: record.version,
                    name: data.get('contractorName'),
                    email: data.get('contractorEmail'),
                  }),
                )
              }
            >
              <Field label="Contractor name" htmlFor="wo-contractor-name">
                <TextInput
                  id="wo-contractor-name"
                  name="contractorName"
                  defaultValue={record.contractor?.name}
                  required
                  maxLength={120}
                />
              </Field>
              <Field label="Contractor email" htmlFor="wo-contractor-email">
                <TextInput
                  id="wo-contractor-email"
                  name="contractorEmail"
                  type="email"
                  defaultValue={record.contractor?.email}
                  required
                  maxLength={254}
                />
              </Field>
              <p className="sm muted">
                They get an email with a link to the job. They don’t need an account. Sending to the same address again
                issues a new link and ends the old one.
              </p>
              <div>
                <Button type="submit" disabled={busy}>
                  {record.contractor ? 'Send the link again' : 'Send to contractor'}
                </Button>
              </div>
            </form>
          )}
          {record.contractor && (WORK_ORDER_UNASSIGNABLE.includes(record.status) || record.status === 'paused') && (
            <form
              onSubmit={(event) =>
                void submit(event, () => helpdeskWrite(base + '/contractor/withdraw', { version: record.version }))
              }
            >
              <Button type="submit" disabled={busy}>
                Take the job back
              </Button>
            </form>
          )}
        </section>
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
          {record.contractor && (
            <p className="sm muted">{record.contractor.name} can read notes that aren’t marked internal.</p>
          )}
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
