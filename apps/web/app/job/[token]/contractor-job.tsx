'use client';

import { useState, type FormEvent } from 'react';
import { Button, Field } from '@cafm/ui';
import {
  SLA_PAUSING_REASONS,
  WORK_ORDER_PAUSE_LABELS,
  WORK_ORDER_PAUSE_REASONS,
  WORK_ORDER_STATUS_LABELS,
  type ContractorJob,
  type WorkOrderPauseReason,
  type WorkOrderStatus,
} from '@cafm/shared';
import { helpdeskWrite } from '@/lib/helpdesk-client';
import { requestTime } from '@/lib/helpdesk-format';
import styles from './job.module.css';

const STEP_LABELS: Record<string, string> = {
  accepted: 'Accept the job',
  travelling: 'On my way',
  on_site: 'I’m on site',
  paused: 'Pause the job',
  completed: 'Job complete',
};

/** The contractor's page: the job, what they can do next, and the notes so far. */
export function ContractorJobView({ token, initial }: { token: string; initial: ContractorJob }) {
  const [job, setJob] = useState(initial);
  const [status, setStatus] = useState<WorkOrderStatus | ''>('');
  const [reason, setReason] = useState<WorkOrderPauseReason | ''>('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [done, setDone] = useState('');
  const base = '/contractor-jobs/' + encodeURIComponent(token);

  async function run(
    event: FormEvent<HTMLFormElement>,
    call: (values: FormData) => Promise<ContractorJob>,
    ok: string,
  ) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    setDone('');
    const form = event.currentTarget;
    try {
      setJob(await call(new FormData(form)));
      form.reset();
      setStatus('');
      setReason('');
      setDone(ok);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save this change.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={'page stack g4 ' + styles.shell}>
      <header className="stack g2">
        <p className="muted">For {job.contractorName}</p>
        <div className="row wrap g2">
          <span className="ref">{job.number}</span>
          <span className="badge primary">
            {WORK_ORDER_STATUS_LABELS[job.status]}
            {job.pauseReason ? ' · ' + WORK_ORDER_PAUSE_LABELS[job.pauseReason] : ''}
          </span>
          <span className={'badge ' + (job.priority === 1 ? 'danger' : job.priority === 2 ? 'warning' : '')}>
            P{job.priority}
          </span>
        </div>
        <h1 className="page-title">{job.title}</h1>
      </header>
      <section className="card card-b stack g3" aria-labelledby="job-details">
        <h2 className="card-t" id="job-details">
          The job
        </h2>
        <p className={styles.text}>{job.description}</p>
        <dl className="kv">
          <dt>Where</dt>
          <dd>
            {job.location.name} · {job.location.code}
            {job.location.address ? ', ' + job.location.address : ''}
          </dd>
          {job.asset && (
            <>
              <dt>Asset</dt>
              <dd>
                {job.asset.name} · {job.asset.number}
              </dd>
            </>
          )}
          {job.attendDueAt && (
            <>
              <dt>Attend by</dt>
              <dd>{requestTime(job.attendDueAt)}</dd>
            </>
          )}
          {job.fixDueAt && (
            <>
              <dt>Fix by</dt>
              <dd>{requestTime(job.fixDueAt)}</dd>
            </>
          )}
        </dl>
      </section>

      {job.nextStatuses.length > 0 && (
        <form
          className="card card-b stack g3"
          aria-labelledby="job-update"
          onSubmit={(event) =>
            void run(
              event,
              (data) =>
                helpdeskWrite<ContractorJob>(base + '/status', {
                  status,
                  ...(status === 'paused' ? { pauseReason: data.get('pauseReason') } : {}),
                  ...(data.get('note') ? { note: data.get('note') } : {}),
                }),
              'Thank you. The job has been updated.',
            )
          }
        >
          <h2 className="card-t" id="job-update">
            Update the job
          </h2>
          <Field label="What’s next?" htmlFor="job-status">
            <select
              id="job-status"
              className={styles.control}
              value={status}
              required
              onChange={(event) => setStatus(event.target.value as WorkOrderStatus | '')}
            >
              <option value="">Choose a step</option>
              {job.nextStatuses.map((next) => (
                <option key={next} value={next}>
                  {STEP_LABELS[next] ?? WORK_ORDER_STATUS_LABELS[next]}
                </option>
              ))}
            </select>
          </Field>
          {status === 'paused' && (
            <Field label="Why is it paused?" htmlFor="job-pause">
              <select
                id="job-pause"
                name="pauseReason"
                className={styles.control}
                required
                value={reason}
                onChange={(event) => setReason(event.target.value as WorkOrderPauseReason | '')}
              >
                <option value="">Choose a reason</option>
                {WORK_ORDER_PAUSE_REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {WORK_ORDER_PAUSE_LABELS[reason]}
                  </option>
                ))}
              </select>
              {reason && (
                <small className="muted">
                  {SLA_PAUSING_REASONS.includes(reason)
                    ? 'The team’s clock is stopped while the job is paused for this reason.'
                    : 'The team’s clock keeps running for this reason.'}
                </small>
              )}
            </Field>
          )}
          <Field label="Note (optional)" htmlFor="job-status-note">
            <textarea id="job-status-note" name="note" className={styles.textarea} maxLength={1200} />
          </Field>
          <div>
            <Button type="submit" variant="primary" disabled={busy || !status}>
              Update job
            </Button>
          </div>
        </form>
      )}

      <section className="card card-b stack g3" aria-labelledby="job-notes">
        <h2 className="card-t" id="job-notes">
          Notes
        </h2>
        {job.notes.length ? (
          <ol className={styles.timeline}>
            {job.notes.map((note) => (
              <li key={note.id} className="stack g2">
                <div className="row wrap between g2">
                  <strong>{note.author}</strong>
                  <time className="muted sm" dateTime={note.createdAt}>
                    {requestTime(note.createdAt)}
                  </time>
                </div>
                <p className={styles.text}>{note.body}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">No notes yet.</p>
        )}
        {!['closed', 'cancelled'].includes(job.status) && (
          <form
            className="stack g3"
            onSubmit={(event) =>
              void run(
                event,
                (data) => helpdeskWrite<ContractorJob>(base + '/notes', { body: data.get('note') }),
                'Your note has been added.',
              )
            }
          >
            <Field label="Add a note" htmlFor="job-note">
              <textarea id="job-note" name="note" className={styles.textarea} required maxLength={6000} />
            </Field>
            <div>
              <Button type="submit" icon="comment" disabled={busy}>
                Add note
              </Button>
            </div>
          </form>
        )}
      </section>
      {done && <p role="status">{done}</p>}
      {message && (
        <p role="alert" className="field-error">
          {message}
        </p>
      )}
      <p className="sm muted">
        This link is only for {job.contractorName}. It works until {requestTime(job.expiresAt)}.
      </p>
    </main>
  );
}
