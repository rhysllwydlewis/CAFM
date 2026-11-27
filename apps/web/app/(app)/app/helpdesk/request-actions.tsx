'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Checkbox, Field } from '@fmstead/ui';
import {
  acceptsRequestComments,
  REQUEST_STATUS_LABELS,
  REQUEST_TRANSITIONS,
  type RequestRecord,
  type RequestStatus,
  type RequestTypeChoice,
} from '@fmstead/shared';
import { helpdeskWrite } from '@/lib/helpdesk-client';
import { RecordPicker } from './record-picker';
import styles from './helpdesk.module.css';

export function RequestActions({
  record,
  own,
  duplicates,
  triageTypes,
}: {
  record: RequestRecord;
  own: boolean;
  triageTypes?: RequestTypeChoice[];
  duplicates?: { id: string; number: string; title: string; version: number }[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [assignee, setAssignee] = useState(
    record.assigneeId && record.assigneeName ? { id: record.assigneeId, name: record.assigneeName } : null,
  );
  const [status, setStatus] = useState<RequestStatus | ''>('');
  const base = '/helpdesk/' + (own ? 'mine/' : 'requests/') + record.id;

  async function submit(event: FormEvent<HTMLFormElement>, run: (values: FormData) => Promise<unknown>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const form = event.currentTarget;
    try {
      await run(new FormData(form));
      form.reset();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save this change.');
    } finally {
      setBusy(false);
    }
  }

  let management: ReactNode = null;
  const moves = REQUEST_TRANSITIONS[record.status] ?? [];
  const canAssign = ['new', 'assigned', 'in_progress'].includes(record.status);
  if (!own && moves.length)
    management = (
      <form
        className="stack g3"
        onSubmit={(event) =>
          void submit(event, (data) =>
            helpdeskWrite(
              base,
              {
                version: record.version,
                ...(status ? { status } : {}),
                ...(canAssign ? { assigneeId: assignee?.id ?? null } : {}),
                ...(data.get('note') ? { note: data.get('note') } : {}),
              },
              'PATCH',
            ),
          )
        }
      >
        <h3 className="card-t">Triage request</h3>
        <Field label="Status" htmlFor="request-status">
          <select
            className={styles.control}
            id="request-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as RequestStatus | '')}
          >
            <option value="">Keep current status</option>
            {moves.map((move) => (
              <option value={move} key={move}>
                {REQUEST_STATUS_LABELS[move]}
              </option>
            ))}
          </select>
        </Field>
        {canAssign && (
          <RecordPicker
            label="Assignee"
            path={'/helpdesk/requests/' + record.id + '/assignees'}
            value={assignee}
            onChange={setAssignee}
          />
        )}
        {status === 'rejected' && (
          <Field label="Reason for rejection" htmlFor="request-note">
            <textarea id="request-note" name="note" className={styles.textarea} required maxLength={1200} />
          </Field>
        )}
        <Button type="submit" disabled={busy || (!status && (assignee?.id ?? null) === record.assigneeId)}>
          Save changes
        </Button>
      </form>
    );

  return (
    <div className="stack g4">
      {management}
      {!own && canAssign && triageTypes && (
        <details className="card card-b">
          <summary className="medium">Classification and priority</summary>
          <form
            className="stack g3"
            onSubmit={(event) =>
              void submit(event, (data) =>
                helpdeskWrite(
                  base,
                  {
                    version: record.version,
                    triage: {
                      typeId: data.get('typeId'),
                      impact: Number(data.get('impact')),
                      urgency: Number(data.get('urgency')),
                    },
                  },
                  'PATCH',
                ),
              )
            }
          >
            <Field label="Request type" htmlFor="triage-type">
              <select className={styles.control} id="triage-type" name="typeId" defaultValue={record.type.id} required>
                {triageTypes.map(({ id, category, name, active }) => (
                  <option value={id} key={id}>
                    {category} · {name}
                    {active ? '' : ' (retired)'}
                  </option>
                ))}
              </select>
            </Field>
            <div className={styles.columns}>
              {(['impact', 'urgency'] as const).map((key) => (
                <Field key={key} label={key === 'impact' ? 'Impact' : 'Urgency'} htmlFor={'triage-' + key}>
                  <select className={styles.control} id={'triage-' + key} name={key} defaultValue={record[key]}>
                    <option value="1">High</option>
                    <option value="2">Medium</option>
                    <option value="3">Low</option>
                  </select>
                </Field>
              ))}
            </div>
            <Button type="submit" disabled={busy}>
              Save classification
            </Button>
          </form>
        </details>
      )}
      {duplicates && duplicates.length > 0 && canAssign && (
        <form
          className="stack g3"
          onSubmit={(event) =>
            void submit(event, (data) => {
              const target = duplicates.find((item) => item.id === data.get('target'));
              if (!target) throw new Error('Choose a possible duplicate.');
              return helpdeskWrite(base + '/merge', {
                version: record.version,
                targetId: target.id,
                targetVersion: target.version,
              });
            })
          }
        >
          <Field label="Possible duplicate" htmlFor="request-duplicate">
            <select className={styles.control} id="request-duplicate" name="target" required>
              <option value="">Choose a related request</option>
              {duplicates.map(({ id, number, title }) => (
                <option key={id} value={id}>
                  {number} · {title}
                </option>
              ))}
            </select>
          </Field>
          <p className="sm muted">Link this request as a duplicate. Both requesters keep their own history.</p>
          <Button type="submit" disabled={busy}>
            Merge duplicate
          </Button>
        </form>
      )}
      {acceptsRequestComments(record.status) && (
        <form
          className="stack g3"
          onSubmit={(event) =>
            void submit(event, (data) =>
              helpdeskWrite(base + '/comments', {
                body: data.get('comment'),
                internal: data.get('internal') === 'on',
              }),
            )
          }
        >
          <Field label="Add a comment" htmlFor="request-comment">
            <textarea className={styles.textarea} id="request-comment" name="comment" required maxLength={6000} />
          </Field>
          {!own && <Checkbox label="Internal note" name="internal" />}
          <Button icon="comment" type="submit" disabled={busy}>
            Send comment
          </Button>
        </form>
      )}
      {own && ['completed', 'closed'].includes(record.linkedStatus ?? record.status) && record.rating === null && (
        <form
          className="stack g3"
          onSubmit={(event) =>
            void submit(event, (data) =>
              helpdeskWrite(base + '/rating', {
                rating: Number(data.get('rating')),
                feedback: data.get('feedback'),
              }),
            )
          }
        >
          <Field label="Rate this job" htmlFor="request-rating">
            <select className={styles.control} id="request-rating" name="rating" required defaultValue="">
              <option value="">Choose a rating</option>
              {[1, 2, 3, 4, 5].map((rating) => (
                <option key={rating} value={rating}>
                  {rating} out of 5
                </option>
              ))}
            </select>
          </Field>
          <Field label="Feedback (optional)" htmlFor="request-feedback">
            <textarea className={styles.textarea} id="request-feedback" name="feedback" maxLength={1200} />
          </Field>
          <Button type="submit" disabled={busy}>
            Send feedback
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
