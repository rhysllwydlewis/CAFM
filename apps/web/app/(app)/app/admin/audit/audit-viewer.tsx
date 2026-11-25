'use client';

import { useState } from 'react';
import { Button, Field, TextInput } from '@cafm/ui';
import type { AuditEventView, AuditFilterOptions, AuditPage } from '@cafm/shared';
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
  actorId: string;
  entityType: string;
  entityId: string;
  from: string;
  to: string;
}

const NO_FILTERS: Filters = { action: '', actorId: '', entityType: '', entityId: '', from: '', to: '' };

/** The query string for a set of filters. Dates cover whole days, in UTC. */
function queryFor(filters: Filters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.action) params.set('action', filters.action);
  if (filters.actorId) params.set('actorId', filters.actorId);
  if (filters.entityType) params.set('entityType', filters.entityType);
  if (filters.entityId) params.set('entityId', filters.entityId);
  if (filters.from) params.set('from', filters.from + 'T00:00:00.000Z');
  if (filters.to) params.set('to', filters.to + 'T23:59:59.999Z');
  return params;
}

/** The audit log (admin-09-audit): newest first, filtered by event, person, record and dates, 50 at a time. */
export function AuditViewer({ first, options }: { first: AuditPage; options: AuditFilterOptions }) {
  const [items, setItems] = useState<AuditEventView[]>(first.items);
  const [next, setNext] = useState<string | null>(first.nextCursor);
  const [draft, setDraft] = useState<Filters>(NO_FILTERS);
  // The filters that produced the rows on screen. "Show older events" and the export use these, not the form being edited.
  const [applied, setApplied] = useState<Filters>(NO_FILTERS);
  const change = (patch: Partial<Filters>) => setDraft((old) => ({ ...old, ...patch }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

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

  return (
    <section className="card" aria-labelledby="audit-title">
      <div className="card-h">
        <h2 className="card-t" id="audit-title">
          Audit log
        </h2>
      </div>
      <form
        className="card-b row g2"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          void load({ ...draft, action: draft.action.trim(), entityId: draft.entityId.trim() }, null, true);
        }}
      >
        <Field label="Event" htmlFor="audit-search">
          <TextInput
            id="audit-search"
            value={draft.action}
            placeholder="Such as role or branding"
            onChange={(e) => change({ action: e.target.value })}
          />
        </Field>
        <Field label="Person" htmlFor="audit-person">
          <select
            className={styles.control}
            id="audit-person"
            value={draft.actorId}
            onChange={(e) => change({ actorId: e.target.value })}
          >
            <option value="">Anyone</option>
            {options.people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Record type" htmlFor="audit-type">
          <select
            className={styles.control}
            id="audit-type"
            value={draft.entityType}
            onChange={(e) => change({ entityType: e.target.value })}
          >
            <option value="">Any record</option>
            {options.entityTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Record id" htmlFor="audit-record">
          <TextInput id="audit-record" value={draft.entityId} onChange={(e) => change({ entityId: e.target.value })} />
        </Field>
        <Field label="From" htmlFor="audit-from">
          <TextInput
            id="audit-from"
            type="date"
            value={draft.from}
            onChange={(e) => change({ from: e.target.value })}
          />
        </Field>
        <Field label="To" htmlFor="audit-to">
          <TextInput id="audit-to" type="date" value={draft.to} onChange={(e) => change({ to: e.target.value })} />
        </Field>
        <Button type="submit" disabled={busy}>
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
        <a className="btn" href={'/api/admin/audit/export?' + queryFor(applied).toString()} download>
          Export CSV
        </a>
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
