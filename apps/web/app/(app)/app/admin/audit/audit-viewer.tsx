'use client';

import { useId, useState } from 'react';
import { Button, Field, TextInput } from '@cafm/ui';
import type { AuditActor, AuditEventView, AuditPage } from '@cafm/shared';
import styles from '../admin.module.css';

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

interface Filters {
  action: string;
  actor: string;
  entityId: string;
  from: string;
  to: string;
}
const NO_FILTERS: Filters = { action: '', actor: '', entityId: '', from: '', to: '' };

/** The query string for a set of filters. Dates are whole local days, sent as UTC times. */
function queryFor(f: Filters): URLSearchParams {
  const params = new URLSearchParams();
  if (f.action) params.set('action', f.action);
  if (f.actor) params.set('actor', f.actor);
  if (f.entityId) params.set('entityId', f.entityId);
  if (f.from) params.set('from', new Date(f.from + 'T00:00:00').toISOString());
  if (f.to) params.set('to', new Date(f.to + 'T23:59:59.999').toISOString());
  return params;
}

/** The audit log (admin-09-audit): newest first, filtered by event, person, record and date, 50 at a time. */
export function AuditViewer({ first, actors }: { first: AuditPage; actors: AuditActor[] }) {
  const [items, setItems] = useState<AuditEventView[]>(first.items);
  const [next, setNext] = useState<string | null>(first.nextCursor);
  const [draft, setDraft] = useState<Filters>(NO_FILTERS);
  // The filters that produced the rows on screen. "Show older events" and the export use these, not the form being edited.
  const [applied, setApplied] = useState<Filters>(NO_FILTERS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const ids = useId();
  const set = (key: keyof Filters) => (value: string) => setDraft((d) => ({ ...d, [key]: value }));

  async function load(filters: Filters, cursor: string | null, replace: boolean) {
    setBusy(true);
    setError(undefined);
    try {
      const params = queryFor(filters);
      if (cursor) params.set('cursor', cursor);
      const res = await fetch('/api/admin/audit?' + params.toString());
      if (!res.ok) throw new Error('Could not load the audit log.');
      const page = (await res.json()) as AuditPage;
      setItems((old) => (replace ? page.items : [...old, ...page.items]));
      setNext(page.nextCursor);
      if (replace) setApplied(filters);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the audit log.');
    } finally {
      setBusy(false);
    }
  }

  const rangeBackwards = draft.from !== '' && draft.to !== '' && draft.from > draft.to;
  const exportHref = '/api/admin/audit/export?' + queryFor(applied).toString();

  return (
    <section className="card" aria-labelledby="audit-title">
      <div className="card-h">
        <h2 className="card-t" id="audit-title">
          Audit log
        </h2>
        <a className="btn" href={exportHref} download="audit-log.csv">
          Export CSV
        </a>
      </div>
      <form
        className="card-b row g2"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (rangeBackwards) return;
          void load({ ...draft, action: draft.action.trim(), entityId: draft.entityId.trim() }, null, true);
        }}
      >
        <Field label="Event" htmlFor={ids + 'action'}>
          <TextInput
            id={ids + 'action'}
            value={draft.action}
            placeholder="Such as role or branding"
            onChange={(e) => set('action')(e.target.value)}
          />
        </Field>
        <Field label="Who" htmlFor={ids + 'actor'}>
          <select
            className={styles.control}
            id={ids + 'actor'}
            value={draft.actor}
            onChange={(e) => set('actor')(e.target.value)}
          >
            <option value="">Anyone</option>
            {actors.map((a) => (
              <option key={a.membershipId} value={a.membershipId}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Record id" htmlFor={ids + 'record'}>
          <TextInput
            id={ids + 'record'}
            value={draft.entityId}
            placeholder="The id of the record"
            onChange={(e) => set('entityId')(e.target.value)}
          />
        </Field>
        <Field label="From" htmlFor={ids + 'from'}>
          <TextInput id={ids + 'from'} type="date" value={draft.from} onChange={(e) => set('from')(e.target.value)} />
        </Field>
        <Field
          label="To"
          htmlFor={ids + 'to'}
          error={rangeBackwards ? 'The start date must be before the end date.' : undefined}
        >
          <TextInput id={ids + 'to'} type="date" value={draft.to} onChange={(e) => set('to')(e.target.value)} />
        </Field>
        <Button type="submit" disabled={busy || rangeBackwards}>
          Search
        </Button>
        <Button
          type="button"
          disabled={busy}
          onClick={() => {
            setDraft(NO_FILTERS);
            void load(NO_FILTERS, null, true);
          }}
        >
          Clear
        </Button>
      </form>
      <div className={'card-b flush ' + styles.tableWrap}>
        <table className="tbl" aria-labelledby="audit-title">
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>Event</th>
              <th>Record</th>
              <th>IP</th>
              <th>
                <span className="sr-only">Details</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((e) => (
              <tr key={e.id}>
                <td>{when(e.createdAt)}</td>
                <td>{e.actor ?? '—'}</td>
                <td>{e.action}</td>
                <td>{e.entityType}</td>
                <td>{e.ip ?? '—'}</td>
                <td>
                  {e.changes ? (
                    <details>
                      <summary>Details</summary>
                      <pre className="faint sm">{JSON.stringify(e.changes, null, 2)}</pre>
                    </details>
                  ) : null}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  No events match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="card-b">
        <p role="status" className="field-error">
          {error}
        </p>
        {next && (
          <Button onClick={() => load(applied, next, false)} disabled={busy}>
            Show older events
          </Button>
        )}
      </div>
    </section>
  );
}
