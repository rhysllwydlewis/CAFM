import Link from 'next/link';
import { bankHolidays, SITE_JURISDICTIONS, WEEKDAYS, type LocationPage, type LocationRecord } from '@cafm/shared';
import { Icon } from '@cafm/ui';
import { route } from './location-data';
import styles from './locations.module.css';
import { MapCanvas } from './portfolio-map';

const dateLabel = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(iso + 'T00:00:00Z'));

export const statusLabel = (status: string) => status[0]!.toUpperCase() + status.slice(1);

export function LocationProfile({
  location,
  children,
  canManage,
}: {
  location: LocationRecord;
  children: LocationPage;
  canManage: boolean;
}) {
  const data = location.details;
  const showMap = data.latitude !== undefined && data.longitude !== undefined;
  const details = [
    ['Address', data.address],
    ['Use class', data.useClass],
    ['Listed building', data.listed === undefined ? '' : data.listed ? 'Yes' : 'No'],
    ['Site contact', data.contact],
    ['Parking and arrival information', data.parking],
    ['Restricted access instructions', location.restrictedAccess],
    ['Hazards and asbestos information', data.hazards],
  ].filter((row) => row[1]);
  const areas = [
    ['Gross internal area', data.grossArea],
    ['Net internal area', data.netArea],
  ] as const;

  return (
    <div className="stack g4">
      {areas.some(([, value]) => value !== undefined) && (
        <div className={styles.profileGrid}>
          {areas.map(([label, value]) =>
            value === undefined ? null : (
              <div className="card card-b stack g1" key={label}>
                <span className="muted">{label}</span>
                <strong className={styles.measure}>{value.toLocaleString('en-GB')} m²</strong>
              </div>
            ),
          )}
        </div>
      )}
      <div className={showMap ? styles.profileGrid : undefined}>
        <section className="card">
          <header className="card-h">
            <h2 className="card-t">{location.kind === 'site' ? 'Site information' : 'Location information'}</h2>
            {location.kind === 'site' && (
              <span className={'badge ' + (location.status === 'open' ? 'success' : 'outline')}>
                {statusLabel(location.status)}
              </span>
            )}
          </header>
          <div className="card-b">
            {details.length ? (
              <dl className={styles.definition}>
                {details.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="muted">No location details have been entered.</p>
            )}
          </div>
        </section>
        {showMap && (
          <MapCanvas
            compact
            sites={[
              {
                id: location.id,
                status: location.status,
                details: {
                  latitude: data.latitude,
                  longitude: data.longitude,
                },
              },
            ]}
          />
        )}
      </div>
      {location.kind === 'site' && <CalendarProfile location={location} canManage={canManage} />}
      {children.items.length > 0 && (
        <section className="card">
          <header className="card-h">
            <h2 className="card-t">{location.kind === 'site' ? 'Buildings and floors' : 'Locations below'}</h2>
          </header>
          <ul className={styles.siteRows}>
            {children.items.map((child) => (
              <li key={child.id}>
                <Link href={route + '?id=' + child.id} className="link">
                  {child.name}
                </Link>
                <span className="muted">
                  {statusLabel(child.kind)} · {child.code}
                </span>
              </li>
            ))}
          </ul>
          {children.nextCursor && (
            <p className="card-b muted">Open the branch in the hierarchy to browse more locations.</p>
          )}
        </section>
      )}
    </div>
  );
}

function CalendarProfile({ location, canManage }: { location: LocationRecord; canManage: boolean }) {
  const calendar = location.siteCalendar;
  const today = calendar
    ? new Intl.DateTimeFormat('sv-SE', {
        timeZone: calendar.timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date())
    : '';
  const upcoming = calendar?.observeBankHolidays
    ? bankHolidays(calendar.jurisdiction)
        .filter(({ date }) => date >= today)
        .slice(0, 5)
    : [];

  return (
    <section className="card">
      <header className="card-h">
        <h2 className="card-t">Business calendar</h2>
        {canManage && (
          <div className="acts">
            <Link className="btn sm" href={route + '?id=' + location.id + '&mode=calendar'}>
              <Icon name="calendar" /> {calendar ? 'Edit calendar' : 'Set calendar'}
            </Link>
          </div>
        )}
      </header>
      <div className="card-b stack g3">
        {calendar ? (
          <>
            <p className="muted">
              {SITE_JURISDICTIONS[calendar.jurisdiction]} · {calendar.timeZone}
            </p>
            <dl className={styles.definition}>
              {WEEKDAYS.map((weekday, index) => (
                <div key={weekday}>
                  <dt>{weekday}</dt>
                  <dd>
                    {calendar.hours
                      .filter(({ day }) => day === index + 1)
                      .sort((a, b) => a.opens.localeCompare(b.opens))
                      .map(({ opens, closes }) => opens + '–' + closes)
                      .join(', ') || 'Closed'}
                  </dd>
                </div>
              ))}
            </dl>
            {calendar.closures.length > 0 && (
              <div className="stack g1">
                <h3>Custom closures</h3>
                <ul>
                  {calendar.closures.map(({ name, from, to }, index) => (
                    <li key={name + index}>
                      {name} · {dateLabel(from)}
                      {from !== to ? ' to ' + dateLabel(to) : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {upcoming.length > 0 && (
              <div className="stack g1">
                <h3>Upcoming bank holidays</h3>
                <ul>
                  {upcoming.map(({ title, date }) => (
                    <li key={date}>
                      {dateLabel(date)} · {title}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <p className="muted">This site has no business calendar yet.</p>
        )}
      </div>
    </section>
  );
}
