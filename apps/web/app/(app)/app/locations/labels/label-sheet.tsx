'use client';

import { useState, useSyncExternalStore } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Button, Checkbox } from '@fmstead/ui';
import type { LocationRecord } from '@fmstead/shared';
import styles from '../locations.module.css';

const subscribe = () => () => undefined;
type LabelLocation = Pick<LocationRecord, 'id' | 'name' | 'code'>;

export function LabelSheet({
  primaryId,
  locations,
  baseUrl,
}: {
  primaryId: string;
  locations: LabelLocation[];
  /** The deployment's own address. Without one, labels use the address this page was opened at. */
  baseUrl?: string;
}) {
  const browserOrigin = useSyncExternalStore(
    subscribe,
    () => window.location.origin,
    () => '',
  );
  const origin = baseUrl ?? browserOrigin;
  const [selected, setSelected] = useState(() => new Set([primaryId]));
  const [search, setSearch] = useState('');
  const labels = locations.filter((location) => selected.has(location.id));
  const filter = search.trim().toLowerCase();

  return (
    <>
      <section className={'card card-b stack g3 ' + styles.screenOnly}>
        <div className="row wrap g2">
          <label htmlFor="find-label">Find locations for labels</label>
          <input
            id="find-label"
            className={styles.control}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className={styles.labelOptions}>
          {locations
            .filter((location) => (location.name + ' ' + location.code).toLowerCase().includes(filter))
            .map((location) => (
              <Checkbox
                key={location.id}
                label={location.name + ' · ' + location.code}
                checked={selected.has(location.id)}
                onChange={(event) => {
                  const enabled = event.target.checked;
                  setSelected((before) => {
                    const next = new Set(before);
                    if (enabled) next.add(location.id);
                    else next.delete(location.id);
                    return next;
                  });
                }}
              />
            ))}
        </div>
        {origin && (
          <p className="muted sm">
            Labels open <span className="mono">{origin}</span>. Check this is the address people will use before you
            print.
          </p>
        )}
        <Button variant="primary" disabled={!labels.length || !origin} onClick={() => window.print()}>
          Print labels
        </Button>
      </section>
      <section className={styles.printSheet} aria-label="Selected QR labels">
        {origin &&
          labels.map((location) => (
            <article className={styles.label} key={location.id}>
              <QRCodeSVG
                value={origin + '/location-qr/' + location.id}
                level="M"
                marginSize={4}
                size={128}
                title={'QR code for ' + location.name}
              />
              <div className="stack g1">
                <strong>{location.name}</strong>
                <span>{location.code}</span>
              </div>
            </article>
          ))}
      </section>
    </>
  );
}
