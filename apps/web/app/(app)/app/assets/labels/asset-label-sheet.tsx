'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import JsBarcode from 'jsbarcode';
import { Button, Checkbox } from '@cafm/ui';
import type { PrintableAssetTag } from '@cafm/shared';
import styles from '../assets.module.css';

const subscribe = () => () => undefined;
const kindLabel = { qr: 'QR', barcode: 'Barcode', nfc: 'NFC' };

function Barcode({ value }: { value: string }) {
  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const node = svg.current;
    if (!node) return;
    JsBarcode(node, value, { format: 'CODE128', width: 2, height: 54, margin: 20, displayValue: false });
    node.setAttribute(
      'viewBox',
      `0 0 ${node.getAttribute('width')?.replace('px', '')} ${node.getAttribute('height')?.replace('px', '')}`,
    );
  }, [value]);
  return <svg ref={svg} role="img" aria-label={'Barcode ' + value} />;
}

export function AssetLabelSheet({
  tags,
  primary,
  baseUrl,
}: {
  tags: PrintableAssetTag[];
  primary: boolean;
  baseUrl?: string;
}) {
  const browserOrigin = useSyncExternalStore(
    subscribe,
    () => window.location.origin,
    () => '',
  );
  const origin = baseUrl ?? browserOrigin;
  const [selected, setSelected] = useState(() => new Set(primary ? tags.map(({ id }) => id) : []));
  const labels = tags.filter(({ id }) => selected.has(id));

  return (
    <>
      <section className={'card card-b stack g3 ' + styles.printControls}>
        {tags.length ? (
          <>
            <div className="row wrap g2">
              <Button type="button" size="sm" onClick={() => setSelected(new Set(tags.map(({ id }) => id)))}>
                Select all shown
              </Button>
              <Button type="button" size="sm" onClick={() => setSelected(new Set())}>
                Clear selection
              </Button>
            </div>
            <fieldset className={'stack g2 ' + styles.labelOptions}>
              <legend>Select asset labels</legend>
              {tags.map((tag) => (
                <Checkbox
                  key={tag.id}
                  label={tag.asset.name + ' · ' + tag.asset.number + ' · ' + kindLabel[tag.kind] + ' ' + tag.code}
                  checked={selected.has(tag.id)}
                  onChange={(event) => {
                    const next = new Set(selected);
                    if (event.target.checked) next.add(tag.id);
                    else next.delete(tag.id);
                    setSelected(next);
                  }}
                />
              ))}
            </fieldset>
            {origin && (
              <p className="muted sm">
                QR and NFC links use <span className="mono">{origin}</span>. Write an NFC tag’s scan link to the chip
                before fitting it.
              </p>
            )}
            <div>
              <Button variant="primary" disabled={!labels.length || !origin} onClick={() => window.print()}>
                Print selected labels ({labels.length})
              </Button>
            </div>
          </>
        ) : (
          <p className="muted">No active tags found. Issue tags from an asset’s records to print them here.</p>
        )}
      </section>
      <section className={styles.assetPrintSheet} aria-label="Selected asset labels">
        {origin &&
          labels.map((tag) => (
            <article className={styles.assetPrintLabel} key={tag.id}>
              {tag.kind === 'barcode' ? (
                <Barcode value={tag.code} />
              ) : (
                <QRCodeSVG
                  value={origin + '/asset-qr/' + tag.id}
                  level="M"
                  marginSize={4}
                  size={112}
                  title={'QR code for ' + tag.asset.name}
                />
              )}
              <strong>{tag.asset.name}</strong>
              <span>
                {tag.asset.number} · {tag.code}
                {tag.kind === 'nfc' ? ' · NFC' : ''}
              </span>
            </article>
          ))}
      </section>
    </>
  );
}
