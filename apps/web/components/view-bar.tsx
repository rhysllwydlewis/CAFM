'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '@fmstead/ui';
import type { SavedView, ViewEntity, ViewLayout } from '@fmstead/shared';
import { adminWrite } from '@/lib/admin-client';

interface Props {
  entity: ViewEntity;
  /** The list's own address, such as /app/work-orders. */
  route: string;
  /** The filters in the current address. */
  filters: Record<string, string>;
  layout: ViewLayout;
  views: SavedView[];
  canShare: boolean;
  /** The id of the view that matches the address, if one does. */
  activeId?: string;
}

/** Opening a view goes to the list's address with the saved filters, so the server applies them and the link can be shared. */
export function viewHref(route: string, view: Pick<SavedView, 'id' | 'config'>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(view.config.filters)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      params.set(key, String(value));
    } else if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
    }
  }
  if (view.config.layout !== 'list') params.set('layout', view.config.layout);
  params.set('view_id', view.id);
  return route + '?' + params.toString();
}

export function ViewBar({ entity, route, filters, layout, views, canShare, activeId }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const active = views.find((view) => view.id === activeId);
  const filterCount = Object.keys(filters).length;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await action();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save your changes. Try again.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const saved = await run(async () => {
      const created = await adminWrite<SavedView>('/views', {
        entity,
        name,
        visibility: shared ? 'shared' : 'private',
        config: { layout, filters, sort: null, group: null, columns: [] },
      });
      if (created) {
        router.push(viewHref(route, created));
        // The browser keeps the last render of each address it has shown; ask for a fresh one so the list has the new view.
        router.refresh();
      }
    });
    if (saved) {
      setSaving(false);
      setName('');
      setShared(false);
    }
  }

  async function remove(view: SavedView) {
    const removed = await run(() => adminWrite('/views/' + view.id, undefined, 'DELETE'));
    if (removed) {
      router.push(route);
      // Without this the browser can show its kept render of the list from before the delete, with the view still in it.
      router.refresh();
    }
  }

  return (
    <section className="row g2" aria-label="Saved views" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
      <label className="row g2">
        <span className="label">Saved view</span>
        <select
          className="select"
          value={active?.id ?? ''}
          onChange={(event) => {
            const view = views.find((item) => item.id === event.target.value);
            router.push(view ? viewHref(route, view) : route);
          }}
        >
          <option value="">All (no saved view)</option>
          {views.map((view) => (
            <option key={view.id} value={view.id}>
              {view.name}
              {view.visibility === 'shared' ? ' (shared)' : ''}
            </option>
          ))}
        </select>
      </label>
      {active && (active.mine || canShare) && (
        <button type="button" className="btn" disabled={busy} onClick={() => remove(active)}>
          <Icon name="delete" /> Delete view
        </button>
      )}
      {!saving && (
        <button type="button" className="btn" disabled={filterCount === 0} onClick={() => setSaving(true)}>
          <Icon name="add" /> Save current filters as a view
        </button>
      )}
      {saving && (
        <form className="row g2" onSubmit={save} style={{ flexWrap: 'wrap', alignItems: 'center' }}>
          <label className="row g2">
            <span className="label">Name</span>
            <input
              className="input"
              value={name}
              maxLength={80}
              required
              autoFocus
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          {canShare && (
            <label className="row g2">
              <input type="checkbox" checked={shared} onChange={(event) => setShared(event.target.checked)} />
              Share with everyone in the organisation
            </label>
          )}
          <button type="submit" className="btn primary" disabled={busy || !name.trim()}>
            Save view
          </button>
          <button type="button" className="btn" onClick={() => setSaving(false)}>
            Cancel
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="muted">
          {error}
        </p>
      )}
    </section>
  );
}
