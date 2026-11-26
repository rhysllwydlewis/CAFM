'use client';

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Field, TextInput } from '@fmstead/ui';
import { MAX_JOBS_PER_REQUEST, type WorkOrderSummary } from '@fmstead/shared';
import { helpdeskWrite } from '@/lib/helpdesk-client';
import { RecordPicker } from '../helpdesk/record-picker';
import { StatusBadge } from './work-order-parts';
import styles from './work-orders.module.css';

type Person = { id: string; name: string } | null;

/** The jobs raised from a request, and a form to raise more. One request can become several jobs. */
export function RequestWorkOrders({
  requestId,
  requestVersion,
  requestTitle,
  locationId,
  jobs,
  canConvert,
  canAssign,
}: {
  requestId: string;
  requestVersion: number;
  requestTitle: string;
  locationId: string;
  jobs: WorkOrderSummary[];
  canConvert: boolean;
  canAssign: boolean;
}) {
  const router = useRouter();
  const submission = useRef<string | null>(null);
  const [rows, setRows] = useState<{ key: number; assignee: Person }[]>([{ key: 0, assignee: null }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const next = useRef(1);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const values = new FormData(event.currentTarget);
    setBusy(true);
    try {
      submission.current ??= crypto.randomUUID();
      await helpdeskWrite('/work-orders/from-request/' + requestId, {
        submissionId: submission.current,
        requestVersion,
        jobs: rows.map(({ key, assignee }) => {
          const title = String(values.get('title-' + key) ?? '').trim();
          return { ...(title ? { title } : {}), assigneeId: assignee?.id ?? null };
        }),
      });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not raise work orders.');
      setBusy(false);
    }
  }

  return (
    <section className="card card-b stack g3" aria-labelledby="request-work-orders">
      <h2 className="card-t" id="request-work-orders">
        Work orders
      </h2>
      {jobs.length ? (
        <ul className={styles.jobList}>
          {jobs.map((job) => (
            <li key={job.id} className={styles.jobRow}>
              <span className={styles.jobName}>
                <Link className="ref" href={'/app/work-orders/' + job.id}>
                  {job.number}
                </Link>
                <span>{job.title}</span>
              </span>
              <StatusBadge item={job} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No work orders have been raised from this request.</p>
      )}
      {canConvert && (
        <form className="stack g3" onSubmit={submit}>
          <h3 className="card-t">Raise {jobs.length ? 'more work' : 'work'}</h3>
          <p className="sm muted">
            Each job keeps this request’s location, asset, priority and targets. Leave a title blank to use the
            request’s title.
          </p>
          {rows.map(({ key, assignee }, index) => (
            <fieldset key={key} className="stack g2">
              <legend className="medium">Job {index + 1}</legend>
              <Field label="Title" htmlFor={'convert-title-' + key}>
                <TextInput
                  id={'convert-title-' + key}
                  name={'title-' + key}
                  placeholder={requestTitle}
                  maxLength={160}
                />
              </Field>
              {canAssign && (
                <RecordPicker
                  label="Assignee (optional)"
                  path={'/work-orders/locations/' + locationId + '/assignees'}
                  value={assignee}
                  onChange={(person) =>
                    setRows((current) => current.map((row) => (row.key === key ? { ...row, assignee: person } : row)))
                  }
                />
              )}
              {rows.length > 1 && (
                <div>
                  <Button type="button" onClick={() => setRows((current) => current.filter((row) => row.key !== key))}>
                    Remove job {index + 1}
                  </Button>
                </div>
              )}
            </fieldset>
          ))}
          <div className={styles.actions}>
            {rows.length < MAX_JOBS_PER_REQUEST && (
              <Button
                type="button"
                onClick={() => setRows((current) => [...current, { key: next.current++, assignee: null }])}
              >
                Add another job
              </Button>
            )}
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? 'Raising…' : rows.length > 1 ? 'Raise ' + rows.length + ' work orders' : 'Raise work order'}
            </Button>
          </div>
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
