'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { helpdeskWrite } from '@/lib/helpdesk-client';

export type BulkItem = { id: string; label: string; version: number };
type Outcome = {
  succeeded: number;
  failed: number;
  failures: { label: string; message: string }[];
};
type Result = { id: string; ok: boolean; message?: string };
type Bulk = {
  items: BulkItem[];
  /** Only rows still on the page count, so a row that has gone from the list can't be changed unseen. */
  selected: BulkItem[];
  has: (id: string) => boolean;
  toggle: (id: string, on: boolean) => void;
  all: (on: boolean) => void;
  busy: boolean;
  error: string;
  setError: (message: string) => void;
  outcome?: Outcome;
  /** Sends one action for the ticked rows and reports each row's result. */
  run: (path: string, action: Record<string, unknown>, fallback: string) => Promise<void>;
};

const BulkContext = createContext<Bulk | null>(null);

/** Selection for a server-rendered list: rows tick themselves with `SelectRow` and the bar reads the choice. */
export function BulkSelection({ items, children }: { items: BulkItem[]; children: ReactNode }) {
  const router = useRouter();
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [outcome, setOutcome] = useState<Outcome>();
  const value = useMemo<Bulk>(
    () => ({
      items,
      selected: items.filter(({ id }) => ticked.has(id)),
      has: (id) => ticked.has(id),
      toggle: (id, on) =>
        setTicked((current) => {
          const next = new Set(current);
          if (on) next.add(id);
          else next.delete(id);
          return next;
        }),
      all: (on) => setTicked(on ? new Set(items.map(({ id }) => id)) : new Set()),
      busy,
      error,
      setError,
      outcome,
      run: async (path, action, fallback) => {
        const rows = items.filter(({ id }) => ticked.has(id));
        if (!rows.length || busy) return;
        setBusy(true);
        setError('');
        try {
          const response = await helpdeskWrite<{ succeeded: number; failed: number; results: Result[] }>(path, {
            ...action,
            items: rows.map(({ id, version }) => ({ id, version })),
          });
          const labels = new Map(rows.map((row) => [row.id, row.label]));
          setOutcome({
            succeeded: response.succeeded,
            failed: response.failed,
            failures: response.results
              .filter(({ ok }) => !ok)
              .map((row) => ({ label: labels.get(row.id) ?? row.id, message: row.message ?? 'Not changed.' })),
          });
          const changed = new Set(response.results.filter(({ ok }) => ok).map(({ id }) => id));
          setTicked((current) => new Set([...current].filter((id) => !changed.has(id))));
          router.refresh();
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : fallback);
        } finally {
          setBusy(false);
        }
      },
    }),
    [items, ticked, busy, error, outcome, router],
  );
  return <BulkContext.Provider value={value}>{children}</BulkContext.Provider>;
}

export function useBulk(): Bulk {
  const bulk = useContext(BulkContext);
  if (!bulk) throw new Error('Bulk controls belong inside BulkSelection.');
  return bulk;
}

export function SelectAll({ noun }: { noun: string }) {
  const bulk = useBulk();
  return (
    <input
      type="checkbox"
      aria-label={'Select all ' + noun + ' on this page'}
      checked={bulk.items.length > 0 && bulk.selected.length === bulk.items.length}
      onChange={(event) => bulk.all(event.target.checked)}
    />
  );
}

export function SelectRow({ id, label }: { id: string; label: string }) {
  const bulk = useBulk();
  return (
    <input
      type="checkbox"
      aria-label={'Select ' + label}
      checked={bulk.has(id)}
      onChange={(event) => bulk.toggle(id, event.target.checked)}
    />
  );
}

/** The result of the last action, with a line for each row that was not changed, and any error. */
export function BulkOutcome() {
  const { outcome, error } = useBulk();
  return (
    <>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      {outcome && (
        <div role="status" className="stack g2">
          <p>
            {outcome.succeeded} changed
            {outcome.failed ? ', ' + outcome.failed + ' not changed' : ''}.
          </p>
          {outcome.failures.length > 0 && (
            <ul className="sm">
              {outcome.failures.map((row) => (
                <li key={row.label}>
                  <span className="ref">{row.label}</span>: {row.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
