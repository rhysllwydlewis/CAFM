import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  bankHolidays,
  can,
  DEFAULT_SITE_CALENDAR,
  SITE_JURISDICTIONS,
  WEEKDAYS,
  type AdminCalendars,
  type SiteCalendar,
} from '@fmstead/shared';
import { currentUser } from '@/lib/session';
import { readAdmin } from '@/lib/admin';
import styles from '../admin.module.css';

export const metadata: Metadata = { title: 'Business calendars' };

/** "Mon to Fri, 08:00 to 18:00" when every open day has the same hours, otherwise one part per day. */
function describeHours(hours: SiteCalendar['hours']): string {
  if (!hours.length) return 'Never open';
  const days = [...new Set(hours.map((h) => h.day))].sort((a, b) => a - b);
  const windows = (day: number) =>
    hours
      .filter((h) => h.day === day)
      .sort((a, b) => a.opens.localeCompare(b.opens))
      .map((h) => `${h.opens} to ${h.closes}`)
      .join(' and ');
  const same = days.every((day) => windows(day) === windows(days[0]!));
  const consecutive = days.every((day, i) => i === 0 || day === days[i - 1]! + 1);
  const short = (day: number) => WEEKDAYS[day - 1]!.slice(0, 3);
  if (same && consecutive)
    return `${days.length === 1 ? short(days[0]!) : `${short(days[0]!)} to ${short(days.at(-1)!)}`}, ${windows(days[0]!)}`;
  return days.map((day) => `${short(day)} ${windows(day)}`).join(', ');
}

const pageHref = (page: number) => (page === 1 ? '/app/admin/calendars' : `/app/admin/calendars?page=${page}`);

export default async function AdminCalendarsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const [{ page: requested }, user] = await Promise.all([searchParams, currentUser()]);
  if (!can(user, 'settings.manage')) redirect('/app');
  const asked = Number.parseInt(requested ?? '1', 10);
  const data = await readAdmin<AdminCalendars>(
    `/admin/calendars?page=${Number.isInteger(asked) && asked > 0 ? asked : 1}`,
  );
  // The counts cover every site the person can see, and `page` is the page the server really returned.
  const { sites, page, pageSize, total, missing } = data;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  // What a site without a calendar of its own runs on for business-hours priorities (see slaSchedule in the API).
  const defaultHours = describeHours(DEFAULT_SITE_CALENDAR.hours);
  return (
    <section className="card" aria-labelledby="calendars-title">
      <div className="card-h">
        <h2 className="card-t" id="calendars-title">
          Business calendars
        </h2>
      </div>
      <div className="card-b stack g3">
        <p className="muted">
          When each site is open, which bank holidays it observes and when it closes. Service level clocks for
          business-hours priorities run on these hours.
        </p>
        {missing > 0 && (
          <div className="callout warning" role="status">
            <b>{missing === 1 ? '1 site has no business calendar.' : `${missing} sites have no business calendar.`}</b>{' '}
            {missing === 1 ? 'Its service level clock uses' : 'Their service level clocks use'} the default hours,{' '}
            {defaultHours} ({DEFAULT_SITE_CALENDAR.timeZone}), until you set one. Priorities that run around the clock
            are not affected.
          </div>
        )}
        {sites.length === 0 ? (
          <p className="muted">No sites yet.</p>
        ) : (
          <div className={styles.tableWrap} role="region" aria-label="Sites and their calendars" tabIndex={0}>
            <table className="tbl">
              <caption className="sr-only">Business calendar for each site</caption>
              <thead>
                <tr>
                  <th scope="col">Site</th>
                  <th scope="col">Bank holidays</th>
                  <th scope="col">Opening hours</th>
                  <th scope="col">Closures</th>
                  <th scope="col">Time zone</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sites.map(({ id, name, calendar }) => (
                  <tr key={id}>
                    <th scope="row">{name}</th>
                    {calendar ? (
                      <>
                        <td>
                          {calendar.observeBankHolidays && bankHolidays(calendar.jurisdiction).length
                            ? SITE_JURISDICTIONS[calendar.jurisdiction]
                            : 'Not observed'}
                        </td>
                        <td>{describeHours(calendar.hours)}</td>
                        <td>
                          {calendar.closures.length === 0
                            ? 'None'
                            : `${calendar.closures.length} ${calendar.closures.length === 1 ? 'closure' : 'closures'}`}
                        </td>
                        <td>{calendar.timeZone}</td>
                      </>
                    ) : (
                      <>
                        <td className="faint">No calendar</td>
                        <td className="faint">Default: {defaultHours}</td>
                        <td />
                        <td className="faint">{DEFAULT_SITE_CALENDAR.timeZone}</td>
                      </>
                    )}
                    <td>
                      <Link className="btn sm" href={`/app/locations?id=${id}`}>
                        {calendar ? 'Edit' : 'Set up'}
                        <span className="sr-only"> calendar for {name}</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <footer className="row between wrap g2">
            <span className="muted" aria-live="polite">
              Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of {total} sites
            </span>
            <span className="row g2">
              {page > 1 && (
                <Link className="btn sm" href={pageHref(page - 1)}>
                  Previous page
                </Link>
              )}
              {page < pages && (
                <Link className="btn sm" href={pageHref(page + 1)}>
                  Next page
                </Link>
              )}
            </span>
          </footer>
        )}
        <p className="xs faint">
          Edit a site&apos;s calendar on its location page. Bank holidays come from the UK government list for the
          site&apos;s nation.
        </p>
      </div>
    </section>
  );
}
