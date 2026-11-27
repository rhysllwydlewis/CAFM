'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button, Icon, TextInput } from '@fmstead/ui';
import type { LocationPage } from '@fmstead/shared';
import styles from './locations.module.css';

const route = '/app/locations';

async function fetchPage(query: Record<string, string>, signal?: AbortSignal): Promise<LocationPage> {
  const response = await fetch('/api/locations?' + new URLSearchParams({ limit: '50', ...query }), { signal });
  if (!response.ok) throw new Error('Locations could not be loaded.');
  return response.json() as Promise<LocationPage>;
}

function Node({
  row,
  selectedId,
  openIds,
  flat,
}: {
  row: LocationPage['items'][number];
  selectedId?: string;
  openIds: readonly string[];
  flat?: boolean;
}) {
  // Regions start open, and so does every branch on the way to the selected location.
  const [open, setOpen] = useState(row.kind === 'portfolio' || row.kind === 'region' || openIds.includes(row.id));
  const [children, setChildren] = useState<LocationPage>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (flat || !row.hasChildren || !open) return;
    const controller = new AbortController();
    fetchPage({ parent: row.id }, controller.signal)
      .then((result) => {
        setChildren(result);
        setFailed(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [attempt, flat, open, row.hasChildren, row.id]);

  const selected = selectedId === row.id;
  return (
    <li>
      <div className={styles.treeRow} data-selected={selected || undefined}>
        {!flat && row.hasChildren && (
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={open}
            aria-label={(open ? 'Collapse ' : 'Expand ') + row.name}
            onClick={() => setOpen(!open)}
          >
            <Icon name={open ? 'chevron-down' : 'chevron-right'} />
          </Button>
        )}
        <Link className={styles.treeLink} href={route + '?id=' + row.id} aria-current={selected ? 'page' : undefined}>
          <Icon name={row.kind === 'site' ? 'site' : row.kind === 'floor' ? 'layers' : 'location'} />
          <span>{row.name}</span>
          <span className="muted">{row.code}</span>
        </Link>
      </div>
      {!flat &&
        row.hasChildren &&
        open &&
        (failed ? (
          <Button
            size="sm"
            onClick={() => {
              setFailed(false);
              setAttempt(attempt + 1);
            }}
          >
            Retry loading
          </Button>
        ) : children ? (
          <Rows initial={children} query={{ parent: row.id }} selectedId={selectedId} openIds={openIds} />
        ) : (
          <p className="sm muted" role="status">
            Loading branches…
          </p>
        ))}
    </li>
  );
}

function Rows({
  initial,
  query,
  selectedId,
  openIds,
  flat,
}: {
  initial: LocationPage;
  query: Record<string, string>;
  selectedId?: string;
  openIds: readonly string[];
  flat?: boolean;
}) {
  const [more, setMore] = useState<LocationPage>();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const cursor = more ? more.nextCursor : initial.nextCursor;
  async function loadMore() {
    if (!cursor || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const page = await fetchPage({ ...query, after: cursor });
      setMore({ ...page, items: [...(more?.items ?? []), ...page.items] });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <ul className={styles.treeList}>
        {[...initial.items, ...(more?.items ?? [])].map((row) => (
          <Node key={row.id} row={row} selectedId={selectedId} openIds={openIds} flat={flat} />
        ))}
      </ul>
      {cursor && (
        <Button size="sm" disabled={busy} onClick={loadMore}>
          {busy ? 'Loading…' : 'Load more'}
        </Button>
      )}
      {failed && (
        <p role="alert" className="field-error">
          Could not load more locations. Try again.
        </p>
      )}
    </>
  );
}

export function LocationBrowser({
  initial,
  search,
  selectedId,
  openIds = [],
}: {
  initial: LocationPage;
  search: string;
  selectedId?: string;
  /** Branches to open, so the selected location is visible in the tree. */
  openIds?: readonly string[];
}) {
  return (
    <aside className="card" aria-labelledby="location-hierarchy-title">
      <header className="card-h">
        <h2 className="card-t" id="location-hierarchy-title">
          Hierarchy
        </h2>
      </header>
      <div className="card-b stack g3">
        <form className={styles.searchForm} action={route}>
          <TextInput
            type="search"
            name="q"
            aria-label="Find a location"
            placeholder="Find a location"
            defaultValue={search}
            maxLength={120}
          />
          <Button type="submit" size="sm">
            Search
          </Button>
        </form>
        {search && (
          <Link href={route} className="link">
            Clear search
          </Link>
        )}
        {initial.items.length ? (
          <Rows
            key={search}
            initial={initial}
            query={search ? { q: search } : { parent: 'root' }}
            selectedId={selectedId}
            openIds={openIds}
            flat={!!search}
          />
        ) : (
          <p className="muted">{search ? 'No locations match your search.' : 'No locations to display.'}</p>
        )}
      </div>
    </aside>
  );
}
