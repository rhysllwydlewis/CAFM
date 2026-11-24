'use client';

import { useId, useState, type FormEvent } from 'react';
import { Button } from '@cafm/ui';
import { ASSET_STATUSES } from '@cafm/shared';
import { BulkOutcome, useBulk } from '@/components/bulk-selection';
import { STATUS_LABELS } from './asset-labels';
import styles from './assets.module.css';

type Status = (typeof ASSET_STATUSES)[number];

/** Changes the status of the ticked assets. Each is still checked by the API, so a refused one is reported, not hidden. */
export function AssetBulkBar() {
  const { selected, busy, run, outcome, error } = useBulk();
  const id = useId();
  const [status, setStatus] = useState<Status>('out_of_service');
  if (!selected.length && !outcome && !error) return null;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run('/assets/bulk', { action: 'status', status }, 'Could not change the assets.');
  };
  return (
    <div className="card-b stack g3">
      {selected.length > 0 && (
        <form className="row wrap g2" onSubmit={submit} aria-label="Bulk actions">
          <strong>{selected.length} selected</strong>
          <label className="field" htmlFor={id}>
            <span className="label">Set status to</span>
            <select
              id={id}
              className={styles.control}
              value={status}
              onChange={(event) => setStatus(event.target.value as Status)}
            >
              {ASSET_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={busy}>
            {busy ? 'Applying…' : 'Apply to ' + selected.length}
          </Button>
        </form>
      )}
      <BulkOutcome />
    </div>
  );
}
