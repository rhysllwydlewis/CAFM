'use client';

import Link from 'next/link';
import type { FieldDefinition } from '@fmstead/config-engine';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, Checkbox, Field, TextInput } from '@fmstead/ui';
import {
  DEFAULT_SITE_CALENDAR,
  LOCATION_KINDS,
  LOCATION_STATUSES,
  SITE_JURISDICTIONS,
  WEEKDAYS,
  type LocationRecord,
  type SiteCalendar,
} from '@fmstead/shared';
import styles from './locations.module.css';
import { LocationCustomFields, readCustomFields } from './location-custom-fields';

const route = '/app/locations';
const textFields = [
  ['address', 'Address', 300],
  ['useClass', 'Use class', 100],
  ['contact', 'Site contact', 200],
  ['parking', 'Parking and arrival information', 500],
  ['hazards', 'Hazards and asbestos information', 1000],
] as const;
const numberFields = [
  ['latitude', 'Latitude'],
  ['longitude', 'Longitude'],
  ['grossArea', 'Gross internal area (m²)'],
  ['netArea', 'Net internal area (m²)'],
] as const;

/** Every message the API gave, whether it came as a list, a single message or a message per field. */
function errorText(result: { message?: string | string[]; errors?: Record<string, string> }) {
  if (result.errors) return Object.values(result.errors).join(' ');
  if (Array.isArray(result.message)) return result.message.join(' ');
  return result.message ?? 'Could not save this location.';
}

function useLocationSave() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(id: string | undefined, body: unknown) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(id ? '/api/locations/' + id : '/api/locations', {
        method: id ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        setError(errorText((await response.json().catch(() => ({}))) as Parameters<typeof errorText>[0]));
        return;
      }
      const saved = (await response.json()) as LocationRecord;
      router.replace(route + '?id=' + saved.id);
      router.refresh();
    } catch {
      setError('Could not reach FM Stead. Try saving again.');
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, save };
}

export function LocationForm({
  location,
  parent,
  parents,
  customFields,
  canMove,
}: {
  location?: LocationRecord;
  parent?: LocationRecord;
  parents: LocationRecord[];
  customFields: FieldDefinition[];
  canMove: boolean;
}) {
  const { busy, error, save } = useLocationSave();
  const values = location?.details;
  const cancel = location ?? parent;
  const defaultKind = parent && !['portfolio', 'region'].includes(parent.kind) ? 'space' : 'site';

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const details = Object.fromEntries([
      ...textFields.flatMap(([key]) => (data.get(key) ? [[key, data.get(key)]] : [])),
      ...numberFields.flatMap(([key]) => (data.get(key) ? [[key, Number(data.get(key))]] : [])),
      ...(data.get('listed') === '' ? [] : [['listed', data.get('listed') === 'yes']]),
    ]);
    const common = {
      name: data.get('name'),
      code: data.get('code'),
      status: data.get('status'),
      details,
      ...(customFields.length ? { custom: readCustomFields(customFields, data) } : {}),
      restrictedAccess: data.get('restrictedAccess') || null,
      ...(canMove ? { parentId: data.get('parentId') || null } : {}),
    };
    void save(
      location?.id,
      location
        ? { ...common, version: location.version }
        : { ...common, kind: data.get('kind'), ...(canMove ? {} : { parentId: parent?.id }) },
    );
  }

  return (
    <section className="card">
      <header className="card-h">
        <h2 className="card-t">{location ? 'Edit location' : 'Add location'}</h2>
      </header>
      <form className="card-b stack g4" onSubmit={submit}>
        <div className={styles.formGrid}>
          <Field label="Name" htmlFor="location-name">
            <TextInput id="location-name" name="name" defaultValue={location?.name} required maxLength={120} />
          </Field>
          <Field label="Code" htmlFor="location-code">
            <TextInput id="location-code" name="code" defaultValue={location?.code} required maxLength={32} />
          </Field>
          {!location && (
            <Field label="Level" htmlFor="location-kind">
              <select id="location-kind" name="kind" defaultValue={defaultKind} className={styles.control}>
                {LOCATION_KINDS.filter((kind) => canMove || !['portfolio', 'region', 'site'].includes(kind)).map(
                  (kind) => (
                    <option key={kind} value={kind}>
                      {kind[0]!.toUpperCase() + kind.slice(1)}
                    </option>
                  ),
                )}
              </select>
            </Field>
          )}
          {canMove && (
            <Field label="Parent location" htmlFor="location-parent">
              <select
                id="location-parent"
                name="parentId"
                defaultValue={location ? (location.parentId ?? '') : (parent?.id ?? '')}
                className={styles.control}
              >
                <option value="">Top level</option>
                {parents
                  .filter((row) => row.id !== location?.id)
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name} ({row.code})
                    </option>
                  ))}
              </select>
            </Field>
          )}
          <Field label="Status" htmlFor="location-status">
            <select
              id="location-status"
              name="status"
              defaultValue={location?.status ?? 'open'}
              className={styles.control}
            >
              {LOCATION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status[0]!.toUpperCase() + status.slice(1)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Listed building" htmlFor="location-listed">
            <select
              id="location-listed"
              name="listed"
              defaultValue={values?.listed === undefined ? '' : values.listed ? 'yes' : 'no'}
              className={styles.control}
            >
              <option value="">Unknown</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </Field>
          {textFields.map(([key, label, max]) => (
            <Field key={key} label={label} htmlFor={'location-' + key}>
              <TextInput id={'location-' + key} name={key} defaultValue={values?.[key]} maxLength={max} />
            </Field>
          ))}
          {numberFields.map(([key, label]) => (
            <Field key={key} label={label} htmlFor={'location-' + key}>
              <TextInput id={'location-' + key} name={key} type="number" step="any" defaultValue={values?.[key]} />
            </Field>
          ))}
        </div>
        <LocationCustomFields fields={customFields} values={location?.custom} />
        <Field label="Restricted access instructions" htmlFor="restricted-access">
          <textarea
            id="restricted-access"
            name="restrictedAccess"
            className={styles.control}
            maxLength={600}
            defaultValue={location?.restrictedAccess ?? ''}
          />
        </Field>
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
        <div className="row g2">
          <Button variant="primary" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save location'}
          </Button>
          <Link className="btn" href={cancel ? route + '?id=' + cancel.id : route}>
            Cancel
          </Link>
        </div>
      </form>
    </section>
  );
}

export function CalendarForm({ location }: { location: LocationRecord }) {
  const { busy, error, save } = useLocationSave();
  const [calendar, setCalendar] = useState(location.siteCalendar ?? DEFAULT_SITE_CALENDAR);

  const changeHours = (index: number, value: Partial<SiteCalendar['hours'][number]>) =>
    setCalendar({
      ...calendar,
      hours: calendar.hours.map((window, i) => (i === index ? { ...window, ...value } : window)),
    });
  const changeClosure = (index: number, value: Partial<SiteCalendar['closures'][number]>) =>
    setCalendar({
      ...calendar,
      closures: calendar.closures.map((closure, i) => (i === index ? { ...closure, ...value } : closure)),
    });

  return (
    <section className="card">
      <header className="card-h">
        <h2 className="card-t">Edit business calendar</h2>
      </header>
      <form
        className="card-b stack g4"
        onSubmit={(event) => {
          event.preventDefault();
          void save(location.id, { version: location.version, siteCalendar: calendar });
        }}
      >
        <div className={styles.formGrid}>
          <Field label="Jurisdiction" htmlFor="calendar-jurisdiction">
            <select
              id="calendar-jurisdiction"
              className={styles.control}
              value={calendar.jurisdiction}
              onChange={(event) =>
                setCalendar({ ...calendar, jurisdiction: event.target.value as SiteCalendar['jurisdiction'] })
              }
            >
              {Object.entries(SITE_JURISDICTIONS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Time zone" htmlFor="calendar-zone">
            <TextInput
              id="calendar-zone"
              value={calendar.timeZone}
              required
              placeholder="Europe/London"
              onChange={(event) => setCalendar({ ...calendar, timeZone: event.target.value })}
            />
          </Field>
        </div>
        <Checkbox
          label="Observe UK bank holidays"
          checked={calendar.observeBankHolidays}
          onChange={(event) => setCalendar({ ...calendar, observeBankHolidays: event.target.checked })}
        />
        {calendar.jurisdiction === 'other' && (
          <p className="hint">
            Bank holidays are built in for England, Wales, Scotland and Northern Ireland. For anywhere else, add the
            days as custom closures.
          </p>
        )}
        <fieldset className={styles.calendarGroup}>
          <legend>Weekly opening hours</legend>
          {calendar.hours.map((window, index) => (
            <div className={styles.calendarRow} key={index}>
              <Field label="Day" htmlFor={'hours-day-' + index}>
                <select
                  id={'hours-day-' + index}
                  className={styles.control}
                  value={window.day}
                  onChange={(event) => changeHours(index, { day: Number(event.target.value) })}
                >
                  {WEEKDAYS.map((day, i) => (
                    <option key={day} value={i + 1}>
                      {day}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Opens" htmlFor={'hours-open-' + index}>
                <TextInput
                  id={'hours-open-' + index}
                  value={window.opens}
                  required
                  inputMode="numeric"
                  placeholder="09:00"
                  onChange={(event) => changeHours(index, { opens: event.target.value })}
                />
              </Field>
              <Field label="Closes" htmlFor={'hours-close-' + index}>
                <TextInput
                  id={'hours-close-' + index}
                  value={window.closes}
                  required
                  inputMode="numeric"
                  placeholder="17:00"
                  onChange={(event) => changeHours(index, { closes: event.target.value })}
                />
              </Field>
              <Button
                size="sm"
                aria-label={'Remove opening window ' + (index + 1)}
                onClick={() => setCalendar({ ...calendar, hours: calendar.hours.filter((_, i) => i !== index) })}
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            size="sm"
            disabled={calendar.hours.length >= 28}
            onClick={() =>
              setCalendar({
                ...calendar,
                hours: [...calendar.hours, { day: 1, opens: '09:00', closes: '17:00' }],
              })
            }
          >
            Add opening window
          </Button>
        </fieldset>
        <fieldset className={styles.calendarGroup}>
          <legend>Custom closures</legend>
          {calendar.closures.map((closure, index) => (
            <div className={styles.calendarRow} key={index}>
              <Field label="Closure name" htmlFor={'closure-name-' + index}>
                <TextInput
                  id={'closure-name-' + index}
                  value={closure.name}
                  required
                  maxLength={100}
                  onChange={(event) => changeClosure(index, { name: event.target.value })}
                />
              </Field>
              <Field label="Start date" htmlFor={'closure-from-' + index}>
                <TextInput
                  id={'closure-from-' + index}
                  type="date"
                  value={closure.from}
                  required
                  onChange={(event) => changeClosure(index, { from: event.target.value })}
                />
              </Field>
              <Field label="End date" htmlFor={'closure-to-' + index}>
                <TextInput
                  id={'closure-to-' + index}
                  type="date"
                  value={closure.to}
                  required
                  onChange={(event) => changeClosure(index, { to: event.target.value })}
                />
              </Field>
              <Button
                size="sm"
                aria-label={'Remove closure ' + (index + 1)}
                onClick={() => setCalendar({ ...calendar, closures: calendar.closures.filter((_, i) => i !== index) })}
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            size="sm"
            disabled={calendar.closures.length >= 100}
            onClick={() =>
              setCalendar({
                ...calendar,
                closures: [...calendar.closures, { name: '', from: '', to: '' }],
              })
            }
          >
            Add closure
          </Button>
        </fieldset>
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
        <div className="row g2">
          <Button variant="primary" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save calendar'}
          </Button>
          <Link className="btn" href={route + '?id=' + location.id}>
            Cancel
          </Link>
        </div>
      </form>
    </section>
  );
}
