'use client';

import { useId, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field } from '@cafm/ui';
import type { AssetPage } from '@cafm/shared';
import { helpdeskWrite } from '@/lib/helpdesk-client';
import styles from './ppm.module.css';

type Choice = { id: string; number: string; name: string; location: string };

/** The assets a schedule covers: put one on, take one off. Each change saves at once. */
export function ScheduleAssets({
  scheduleId,
  version,
  assets,
  meterName,
}: {
  scheduleId: string;
  version: number;
  assets: Choice[];
  meterName: string | null;
}) {
  const router = useRouter();
  const id = useId();
  const [results, setResults] = useState<Choice[]>([]);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const chosen = new Set(assets.map((asset) => asset.id));

  async function save(ids: string[], done: string) {
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await helpdeskWrite(
        `/ppm/schedules/${scheduleId}/assets`,
        { version, assets: ids.map((assetId) => ({ assetId })) },
        'PUT',
      );
      setStatus(done);
      router.refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not save this change.');
    } finally {
      setBusy(false);
    }
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = String(new FormData(event.currentTarget).get('q') ?? '').trim();
    if (!q) return;
    setBusy(true);
    setError('');
    let page: AssetPage;
    try {
      const response = await fetch('/api/assets?limit=10&q=' + encodeURIComponent(q));
      if (!response.ok) throw new Error('Search failed');
      page = (await response.json()) as AssetPage;
    } catch {
      setError('Could not search the assets. Try again.');
      return;
    } finally {
      setBusy(false);
    }
    setSearched(true);
    setResults(
      page.items.map((asset) => ({
        id: asset.id,
        number: asset.number,
        name: asset.name,
        location: asset.locationPath.at(-1) ?? '',
      })),
    );
  }

  return (
    <div className="stack g3">
      <ul className={'stack g2 ' + styles.bareList}>
        {assets.map((asset) => (
          <li key={asset.id} className="row wrap between g2">
            <span>
              <strong>{asset.name}</strong> <span className="muted">{asset.number}</span>
              <span className="sm muted"> · {asset.location}</span>
            </span>
            <Button
              size="sm"
              disabled={busy}
              aria-label={`Take ${asset.name} off this schedule`}
              onClick={() =>
                void save(
                  assets.filter((candidate) => candidate.id !== asset.id).map((candidate) => candidate.id),
                  `${asset.name} is off this schedule.`,
                )
              }
            >
              Remove
            </Button>
          </li>
        ))}
        {assets.length === 0 && <li className="muted">No assets are on this schedule yet.</li>}
      </ul>

      <form className={styles.picker} onSubmit={search} aria-label="Find an asset to add">
        <Field label="Add an asset" htmlFor={id}>
          <small className="muted" id={id + '-hint'}>
            Search by name, number or serial.
            {meterName && ` Each asset needs a meter called ${meterName}.`}
          </small>
          <input id={id} aria-describedby={id + '-hint'} name="q" className={styles.control} maxLength={120} />
        </Field>
        <div>
          <Button type="submit" size="sm" disabled={busy}>
            Search
          </Button>
        </div>
      </form>
      {searched && results.length === 0 && <p className="muted">No assets found.</p>}
      {results.length > 0 && (
        <ul className={styles.pickerList} aria-label="Assets found">
          {results.map((asset) => (
            <li key={asset.id} className="row wrap between g2">
              <span>
                <strong>{asset.name}</strong> <span className="muted">{asset.number}</span>
                <span className="sm muted"> · {asset.location}</span>
              </span>
              {chosen.has(asset.id) ? (
                <span className="muted sm">Already on it</span>
              ) : (
                <Button
                  size="sm"
                  disabled={busy}
                  aria-label={`Add ${asset.name} to this schedule`}
                  onClick={() =>
                    void save(
                      [...assets.map((candidate) => candidate.id), asset.id],
                      `${asset.name} is on this schedule.`,
                    )
                  }
                >
                  Add
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {status && (
        <p className="sm" role="status">
          {status}
        </p>
      )}
    </div>
  );
}
