'use client';

import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Field, TextInput } from '@fmstead/ui';
import {
  WARRANTY_CLAIM_STATUSES,
  type WarrantyClaimItem,
  type AssetMeterItem,
  type AssetMeterReadingItem,
  type AssetTagItem,
  type AssetTagKind,
  type AssetWarrantyItem,
} from '@fmstead/shared';
import { helpdeskWrite } from '@/lib/helpdesk-client';
import { formatDate } from '../../asset-labels';
import styles from '../../assets.module.css';

const TAG_LABEL: Record<AssetTagKind, string> = { qr: 'QR', barcode: 'Barcode', nfc: 'NFC' };
const METER_PATTERN = '[0-9]{1,12}([.][0-9]{1,6})?';
const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' });
const value = (form: FormData, name: string) => String(form.get(name) ?? '');

function Panel({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="card" id={id} aria-labelledby={id + '-title'}>
      <header className="card-h">
        <h2 className="card-t" id={id + '-title'}>
          {title}
        </h2>
      </header>
      <div className="card-b stack g3">{children}</div>
    </section>
  );
}

function SaveForm({
  children,
  submit,
  label,
  reset,
}: {
  children: ReactNode;
  submit: (values: FormData) => Promise<unknown>;
  label: string;
  reset?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      await submit(new FormData(form));
      if (reset) form.reset();
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the record.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack g2" onSubmit={save}>
      {children}
      <div>
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? 'Saving…' : label}
        </Button>
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {saved && <p role="status">Saved.</p>}
    </form>
  );
}

function RetireTag({ path }: { path: string }) {
  const [confirm, setConfirm] = useState(false);
  return confirm ? (
    <SaveForm label="Confirm retirement" submit={() => helpdeskWrite(path, {}, 'PATCH')}>
      <p className="sm">Scans of this tag will stop working.</p>
      <div>
        <Button size="sm" type="button" onClick={() => setConfirm(false)}>
          Cancel
        </Button>
      </div>
    </SaveForm>
  ) : (
    <Button type="button" size="sm" onClick={() => setConfirm(true)}>
      Retire tag
    </Button>
  );
}

export function TagPanel({
  base,
  tags,
  canManage,
  origin,
}: {
  base: string;
  tags: AssetTagItem[];
  canManage: boolean;
  origin?: string;
}) {
  const [copy, setCopy] = useState('');
  async function copyLink(id: string) {
    try {
      await navigator.clipboard.writeText((origin ?? window.location.origin) + '/asset-qr/' + id);
      setCopy('Scan link copied.');
    } catch {
      setCopy('Use the Open scan link menu to copy its address.');
    }
  }
  return (
    <Panel id="tags" title="Tags">
      {tags.length ? (
        <ul className={styles.recordList}>
          {tags.map((tag) => (
            <li key={tag.id} className="stack g2">
              <div className="row wrap between g2">
                <span>
                  <strong>{TAG_LABEL[tag.kind]}</strong> <span className="mono">{tag.code}</span>
                </span>
                <span className={'badge ' + (tag.active ? 'success' : 'outline')}>
                  {tag.active ? 'Active' : 'Retired'}
                </span>
              </div>
              {tag.active && (
                <div className="row wrap g2">
                  <Link href={'/asset-qr/' + tag.id} className="btn sm">
                    Open scan link
                  </Link>
                  {tag.kind === 'nfc' && (
                    <Button size="sm" type="button" onClick={() => void copyLink(tag.id)}>
                      Copy NFC link
                    </Button>
                  )}
                  {canManage && <RetireTag path={base + '/tags/' + tag.id + '/retire'} />}
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No tags issued for this asset.</p>
      )}
      {copy && <p role="status">{copy}</p>}
      {canManage && (
        <details className={styles.recordForm}>
          <summary>Add tag</summary>
          <SaveForm
            label="Issue tag"
            reset
            submit={(form) =>
              helpdeskWrite(base + '/tags', { kind: value(form, 'tag-kind'), code: value(form, 'tag-code') })
            }
          >
            <Field label="Tag type" htmlFor="tag-kind">
              <select className={styles.control} id="tag-kind" name="tag-kind" defaultValue="qr">
                {Object.entries(TAG_LABEL).map(([key, name]) => (
                  <option value={key} key={key}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tag code" htmlFor="tag-code">
              <small className="muted" id="tag-code-hint">
                Use up to 24 letters, digits or hyphens.
              </small>
              <TextInput
                id="tag-code"
                aria-describedby="tag-code-hint"
                name="tag-code"
                maxLength={24}
                pattern="[A-Za-z0-9][A-Za-z0-9\x2d]{0,23}"
                required
              />
            </Field>
          </SaveForm>
        </details>
      )}
    </Panel>
  );
}

function MeterReadings({ base, meter }: { base: string; meter: AssetMeterItem }) {
  const [older, setOlder] = useState<AssetMeterReadingItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [hasMore, setHasMore] = useState(meter.hasMoreReadings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const readings = [...meter.readings, ...older];
  async function more() {
    const before = readings.at(-1)?.recordedAt;
    if (!before) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api' + base + '/meters/' + meter.id + '/readings?before=' + encodeURIComponent(before));
      if (!res.ok) throw new Error('Could not load older readings.');
      const result: { items: AssetMeterReadingItem[]; hasMore: boolean } = await res.json();
      setOlder((items) => [...items, ...result.items]);
      setHasMore(result.hasMore);
      setLoaded(true);
    } catch {
      setError('Could not load older readings. Try again.');
    } finally {
      setBusy(false);
    }
  }
  if (!readings.length) return <p className="muted">No readings recorded.</p>;
  return (
    <>
      <div className={styles.tableWrap}>
        <table className="table">
          <caption className="sr-only">
            {meter.name} readings in {meter.unit}
          </caption>
          <thead>
            <tr>
              <th scope="col">Recorded</th>
              <th scope="col">Reading</th>
              <th scope="col">Cumulative</th>
            </tr>
          </thead>
          <tbody>
            {readings.map((reading) => (
              <tr key={reading.id}>
                <td>
                  <time dateTime={reading.recordedAt}>{time.format(new Date(reading.recordedAt))}</time>
                </td>
                <td>
                  {reading.value}
                  {reading.rolledOver && <span className="muted"> · Rollover</span>}
                </td>
                <td>{reading.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(loaded ? hasMore : meter.hasMoreReadings) && (
        <div>
          <Button type="button" size="sm" disabled={busy} onClick={() => void more()}>
            {busy ? 'Loading…' : 'Load older readings'}
          </Button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </>
  );
}

function RecordReading({ base, meter }: { base: string; meter: AssetMeterItem }) {
  const replay = useRef<{ value: string; rolledOver: boolean; submission: string }>(null);
  return (
    <details className={styles.recordForm}>
      <summary>Record reading</summary>
      <SaveForm
        label="Save reading"
        reset
        submit={async (form) => {
          const reading = value(form, 'reading');
          const rolledOver = form.get('rollover') === 'on';
          if (replay.current?.value !== reading || replay.current.rolledOver !== rolledOver) {
            replay.current = { value: reading, rolledOver, submission: crypto.randomUUID() };
          }
          await helpdeskWrite(base + '/meters/' + meter.id + '/readings', replay.current);
          replay.current = null;
        }}
      >
        <Field label="Current reading" htmlFor={meter.id + '-reading'}>
          <TextInput id={meter.id + '-reading'} name="reading" inputMode="decimal" pattern={METER_PATTERN} required />
        </Field>
        {!!meter.rolloverAt && !!meter.readings.length && (
          <label className="row g2">
            <input type="checkbox" name="rollover" /> Meter rolled over once since the previous reading
          </label>
        )}
      </SaveForm>
    </details>
  );
}

export function MeterPanel({
  base,
  meters,
  canManage,
  canRecord,
}: {
  base: string;
  meters: AssetMeterItem[];
  canManage: boolean;
  canRecord: boolean;
}) {
  return (
    <Panel id="meters" title="Meters">
      {meters.length ? (
        meters.map((meter) => (
          <div className="stack g2" key={meter.id}>
            <h3 className="medium">
              {meter.name} <span className="muted">({meter.unit})</span>
            </h3>
            {meter.rolloverAt && (
              <p className="muted sm">
                Rollover limit {meter.rolloverAt} {meter.unit}
              </p>
            )}
            <MeterReadings key={meter.readings[0]?.id ?? 'empty'} base={base} meter={meter} />
            {canRecord && <RecordReading base={base} meter={meter} />}
          </div>
        ))
      ) : (
        <p className="muted">No meters set up for this asset.</p>
      )}
      {canManage && (
        <details className={styles.recordForm}>
          <summary>Add meter</summary>
          <SaveForm
            label="Save meter"
            reset
            submit={(form) =>
              helpdeskWrite(base + '/meters', {
                name: value(form, 'meter-name'),
                unit: value(form, 'meter-unit'),
                rolloverAt: value(form, 'meter-limit') || null,
              })
            }
          >
            <Field label="Meter name" htmlFor="meter-name">
              <TextInput id="meter-name" name="meter-name" maxLength={100} required />
            </Field>
            <Field label="Unit" htmlFor="meter-unit">
              <TextInput id="meter-unit" name="meter-unit" maxLength={24} required />
            </Field>
            <Field label="Rollover limit (optional)" htmlFor="meter-limit">
              <small className="muted" id="meter-limit-hint">
                Use 1000 for a meter that rolls from 999 to 0.
              </small>
              <TextInput
                id="meter-limit"
                aria-describedby="meter-limit-hint"
                name="meter-limit"
                inputMode="decimal"
                pattern={METER_PATTERN}
              />
            </Field>
          </SaveForm>
        </details>
      )}
    </Panel>
  );
}

function WarrantyForm({ base, warranty }: { base: string; warranty?: AssetWarrantyItem }) {
  const id = warranty?.id ?? 'new-warranty';
  return (
    <details className={styles.recordForm}>
      <summary>{warranty ? 'Edit warranty' : 'Add warranty'}</summary>
      <SaveForm
        label="Save warranty"
        reset={!warranty}
        submit={(form) =>
          helpdeskWrite(
            base + '/warranties' + (warranty ? '/' + warranty.id : ''),
            {
              provider: value(form, 'provider'),
              reference: value(form, 'reference'),
              startsOn: value(form, 'starts'),
              expiresOn: value(form, 'expires'),
              noticeDays: Number(value(form, 'notice')),
              notes: value(form, 'notes') || null,
              active: form.get('active') === 'on',
              ...(warranty && { version: warranty.version }),
            },
            warranty ? 'PATCH' : 'POST',
          )
        }
      >
        <Field label="Provider" htmlFor={id + '-provider'}>
          <TextInput id={id + '-provider'} name="provider" defaultValue={warranty?.provider} maxLength={120} required />
        </Field>
        <Field label="Warranty reference" htmlFor={id + '-reference'}>
          <TextInput
            id={id + '-reference'}
            name="reference"
            defaultValue={warranty?.reference}
            maxLength={100}
            required
          />
        </Field>
        <Field label="Start date" htmlFor={id + '-starts'}>
          <TextInput id={id + '-starts'} name="starts" type="date" defaultValue={warranty?.startsOn} required />
        </Field>
        <Field label="Expiry date" htmlFor={id + '-expires'}>
          <TextInput id={id + '-expires'} name="expires" type="date" defaultValue={warranty?.expiresOn} required />
        </Field>
        <Field label="Days before expiry to alert" htmlFor={id + '-notice'}>
          <TextInput
            id={id + '-notice'}
            name="notice"
            type="number"
            min={0}
            max={365}
            defaultValue={warranty?.noticeDays ?? 30}
            required
          />
        </Field>
        <Field label="Notes (optional)" htmlFor={id + '-notes'}>
          <textarea
            className={styles.control}
            id={id + '-notes'}
            name="notes"
            maxLength={2000}
            defaultValue={warranty?.notes ?? ''}
          />
        </Field>
        <label className="row g2">
          <input type="checkbox" name="active" defaultChecked={warranty?.active ?? true} /> Track expiry
        </label>
      </SaveForm>
    </details>
  );
}

const CLAIM_STATUS = { submitted: 'Submitted', accepted: 'Accepted', rejected: 'Rejected', closed: 'Closed' };

function ClaimForm({ path, claim }: { path: string; claim?: WarrantyClaimItem }) {
  const id = claim?.id ?? path.split('/').at(-2)!;
  return (
    <details className={styles.recordForm}>
      <summary>{claim ? 'Edit claim' : 'Add claim'}</summary>
      <SaveForm
        label="Save claim"
        reset={!claim}
        submit={(form) =>
          helpdeskWrite(
            path + (claim ? '/' + claim.id : ''),
            {
              reference: value(form, 'reference'),
              status: value(form, 'status'),
              filedOn: value(form, 'filed'),
              notes: value(form, 'notes') || null,
              ...(claim && { version: claim.version }),
            },
            claim ? 'PATCH' : 'POST',
          )
        }
      >
        <Field label="Claim reference" htmlFor={id + '-claim-ref'}>
          <TextInput id={id + '-claim-ref'} name="reference" defaultValue={claim?.reference} maxLength={100} required />
        </Field>
        <Field label="Filed date" htmlFor={id + '-claim-date'}>
          <TextInput id={id + '-claim-date'} name="filed" type="date" defaultValue={claim?.filedOn} required />
        </Field>
        <Field label="Claim status" htmlFor={id + '-claim-status'}>
          <select
            id={id + '-claim-status'}
            name="status"
            className={styles.control}
            defaultValue={claim?.status ?? 'submitted'}
          >
            {WARRANTY_CLAIM_STATUSES.map((status) => (
              <option key={status} value={status}>
                {CLAIM_STATUS[status]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Claim notes (optional)" htmlFor={id + '-claim-notes'}>
          <textarea
            id={id + '-claim-notes'}
            name="notes"
            className={styles.control}
            maxLength={1000}
            defaultValue={claim?.notes ?? ''}
          />
        </Field>
      </SaveForm>
    </details>
  );
}

export function WarrantyPanel({
  base,
  warranties,
  canManage,
  today,
}: {
  base: string;
  warranties: AssetWarrantyItem[];
  canManage: boolean;
  today: string;
}) {
  return (
    <Panel id="warranties" title="Warranties">
      {warranties.length ? (
        <ul className={styles.recordList}>
          {warranties.map((warranty) => (
            <li className="stack g2" key={warranty.id}>
              <div className="row wrap between g2">
                <strong>
                  {warranty.provider} · {warranty.reference}
                </strong>
                <span className="badge outline">
                  {!warranty.active
                    ? 'Archived'
                    : warranty.expiresOn < today
                      ? 'Expired'
                      : warranty.startsOn > today
                        ? 'Upcoming'
                        : 'Active'}
                </span>
              </div>
              <dl className="kv">
                <dt>Starts</dt>
                <dd>{formatDate(warranty.startsOn)}</dd>
                <dt>Expires</dt>
                <dd>{formatDate(warranty.expiresOn)}</dd>
                <dt>Alert</dt>
                <dd>{warranty.noticeDays ? warranty.noticeDays + ' days before expiry' : 'On the expiry date'}</dd>
              </dl>
              {warranty.notes && <p className={styles.recordNotes}>{warranty.notes}</p>}
              {canManage && <WarrantyForm key={warranty.version} base={base} warranty={warranty} />}
              {!!warranty.claims.length && (
                <ul className={styles.recordList} aria-label="Warranty claims">
                  {warranty.claims.map((claim) => (
                    <li className="stack g2" key={claim.id}>
                      <div className="row wrap between g2">
                        <span>
                          {claim.reference} · {formatDate(claim.filedOn)}
                        </span>
                        <span className="badge outline">{CLAIM_STATUS[claim.status]}</span>
                      </div>
                      {claim.notes && <p className={styles.recordNotes}>{claim.notes}</p>}
                      {canManage && (
                        <ClaimForm
                          key={claim.version}
                          path={base + '/warranties/' + warranty.id + '/claims'}
                          claim={claim}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {canManage && <ClaimForm path={base + '/warranties/' + warranty.id + '/claims'} />}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No warranties recorded.</p>
      )}
      {canManage && <WarrantyForm base={base} />}
    </Panel>
  );
}
