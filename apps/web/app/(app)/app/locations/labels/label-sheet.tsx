'use client';

import { useState, useSyncExternalStore } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Button, Checkbox } from '@cafm/ui';
import type { LocationRecord } from '@cafm/shared';
import styles from '../locations.module.css';

const subscribe = () => () => undefined;

export function LabelSheet({ primary, locations }: { primary: LocationRecord; locations: LocationRecord[] }) {
  const origin = useSyncExternalStore(
    subscribe,
    () => window.location.origin,
    () => '',
  );
  const [selected, setSelected] = useState(() => new Set([primary.id]));
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
