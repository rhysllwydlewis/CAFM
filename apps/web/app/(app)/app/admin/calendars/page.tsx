import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { bankHolidays, can, SITE_JURISDICTIONS, WEEKDAYS, type AdminCalendars, type SiteCalendar } from '@cafm/shared';
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

export default async function AdminCalendarsPage() {
  const user = await currentUser();
  if (!can(user, 'settings.manage')) redirect('/app');
  const { sites } = await readAdmin<AdminCalendars>('/admin/calendars');
  const missing = sites.filter((site) => !site.calendar).length;
  return (
    <section className="card" aria-labelledby="calendars-title">
      <div className="card-h">
        <h2 className="card-t" id="calendars-title">
          Business calendars
        </h2>
      </div>
      <div className="card-b stack g3">
        <p className="muted">
          When each site is open, which bank holidays it observes and when it closes. Service level clocks run on these
          hours.
        </p>
        {missing > 0 && (
          <div className="callout warning" role="status">
            <b>{missing === 1 ? '1 site has no business calendar.' : `${missing} sites have no business calendar.`}</b>{' '}
            {missing === 1 ? 'Its service level clock runs' : 'Their service level clocks run'} around the clock until
            you set one.
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
                        <td className="faint">Around the clock</td>
                        <td />
                        <td />
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
        <p className="xs faint">
          Edit a site&apos;s calendar on its location page. Bank holidays come from the UK government list for the
          site&apos;s nation.
        </p>
      </div>
    </section>
  );
}
