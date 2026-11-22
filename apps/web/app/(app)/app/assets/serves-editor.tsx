'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@cafm/ui';
import type { AssetServesRecord, ServedAsset, ServedLocation } from '@cafm/shared';
import { Picker } from './asset-picker';
import { locationLabel, route } from './asset-labels';
import styles from './assets.module.css';

/** Chooses the places and assets an asset serves, and saves the whole set. */
export function ServesEditor({
  asset,
  siteId,
  initial,
}: {
  asset: { id: string; name: string };
  /** Only assets in this site can be served. */
  siteId: string | null;
  initial: AssetServesRecord;
}) {
  const router = useRouter();
  const [locations, setLocations] = useState<ServedLocation[]>(initial.locations);
  const [assets, setAssets] = useState<ServedAsset[]>(initial.assets);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/assets/${asset.id}/serves`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ locationIds: locations.map(({ id }) => id), assetIds: assets.map(({ id }) => id) }),
      });
      if (!response.ok) {
        const result = (await response.json().catch(() => ({}))) as { message?: string | string[] };
        setError(Array.isArray(result.message) ? result.message.join(' ') : (result.message ?? 'Could not save this.'));
        return;
      }
      router.replace(`${route}/${asset.id}`);
      router.refresh();
    } catch {
      setError('Could not reach CAFM. Try saving again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <header className="card-h">
        <h2 className="card-t">What {asset.name} serves</h2>
      </header>
      <div className="card-b stack g4">
        {error && (
          <div className="callout danger" role="alert">
            {error}
          </div>
        )}
        <p className="muted">
          Name the floors and rooms this asset supplies, and the assets that depend on it. Everything must be in the
          same site.
        </p>
        <div className={styles.formGrid}>
          <div className="stack g3">
            <Picker
              label="Add a place it serves"
              endpoint="/api/locations"
              initial={null}
              onSelect={(option) =>
                setLocations((list) =>
                  list.some(({ id }) => id === option.id)
                    ? list
                    : [...list, { id: option.id, name: option.label, path: [option.label] }],
                )
              }
              describe={(item) => ({ id: String(item.id), label: String(item.name), hint: String(item.code) })}
            />
            <ul className={styles.componentList} aria-label="Places served">
              {locations.length === 0 && <li className="muted">No places yet.</li>}
              {locations.map((location) => (
                <li key={location.id}>
                  <span>{locationLabel(location.path)}</span>
                  <Button size="sm" onClick={() => setLocations((list) => list.filter(({ id }) => id !== location.id))}>
                    Remove<span className="sr-only"> {location.name}</span>
                  </Button>
                </li>
              ))}
            </ul>
          </div>
          <div className="stack g3">
            <Picker
              label="Add an asset it serves"
              endpoint="/api/assets"
              params={siteId ? { locationId: siteId } : undefined}
              initial={null}
              onSelect={(option) =>
                setAssets((list) =>
                  option.id === asset.id || list.some(({ id }) => id === option.id)
                    ? list
                    : [...list, { id: option.id, number: option.hint ?? '', name: option.label, status: 'in_service' }],
                )
              }
              describe={(item) => ({ id: String(item.id), label: String(item.name), hint: String(item.number) })}
            />
            <ul className={styles.componentList} aria-label="Assets served">
              {assets.length === 0 && <li className="muted">No assets yet.</li>}
              {assets.map((served) => (
                <li key={served.id}>
                  <span>
                    {served.name} <span className="mono muted">{served.number}</span>
                  </span>
                  <Button size="sm" onClick={() => setAssets((list) => list.filter(({ id }) => id !== served.id))}>
                    Remove<span className="sr-only"> {served.name}</span>
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="row wrap g2">
          <Button variant="primary" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
          <Link className="btn" href={`${route}/${asset.id}`}>
            Cancel
          </Link>
        </div>
      </div>
    </section>
  );
}
