'use client';

import { useState } from 'react';
import { Button, TextInput } from '@cafm/ui';
import type { AuditEventView, AuditPage } from '@cafm/shared';
import styles from '../admin.module.css';

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

/** The audit log (admin-09-audit): newest first, searchable by event, 50 at a time. */
export function AuditViewer({ first }: { first: AuditPage }) {
  const [items, setItems] = useState<AuditEventView[]>(first.items);
  const [next, setNext] = useState<string | null>(first.nextCursor);
  const [action, setAction] = useState('');
  // The search that produced the rows on screen. "Show older events" pages through this, not the text being edited.
  const [applied, setApplied] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function load(search: string, cursor: string | null, replace: boolean) {
    setBusy(true);
    setError(undefined);
    try {
      const params = new URLSearchParams();
      if (search) params.set('action', search);
      if (cursor) params.set('cursor', cursor);
      const res = await fetch('/api/admin/audit?' + params.toString());
      if (!res.ok) throw new Error('Could not load the audit log.');
      const page = (await res.json()) as AuditPage;
      setItems((old) => (replace ? page.items : [...old, ...page.items]));
      setNext(page.nextCursor);
      if (replace) setApplied(search);
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
          void load(action.trim(), null, true);
        }}
      >
        <label className="sr-only" htmlFor="audit-search">
          Search events
        </label>
        <TextInput
          id="audit-search"
          value={action}
          placeholder="Search events, such as role or branding"
          onChange={(e) => setAction(e.target.value)}
        />
        <Button type="submit" disabled={busy}>
          Search
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
