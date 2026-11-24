import Link from 'next/link';
import { WORK_ORDER_FINISHED, type WorkOrderSummary } from '@cafm/shared';
import styles from './work-orders.module.css';

const DAY_MS = 86_400_000;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MAX_PER_DAY = 3;
/** A job due within this long is shown as due soon. */
const SOON_MS = 2 * DAY_MS;

/** A UK calendar day (`YYYY-MM-DD`) for an instant. Jobs fall on the day their fix is due in UK time. */
export function ukDay(instant: Date | string | number): string {
  return new Date(instant).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
}

/** `month` from the address if it is a real month, otherwise the current UK month. */
export function calendarMonth(value: string | string[] | undefined, now: number): string {
  const text = Array.isArray(value) ? value[0] : value;
  return text && /^\d{4}-(0[1-9]|1[0-2])$/.test(text) ? text : ukDay(now).slice(0, 7);
}

export function shiftMonth(month: string, by: number): string {
  const [year, number] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(year, number - 1 + by, 1)).toISOString().slice(0, 7);
}

/** Whole weeks, Monday first, that cover the month. */
export function calendarDays(month: string): string[] {
  const first = new Date(month + '-01T00:00:00Z');
  const offset = (first.getUTCDay() + 6) % 7;
  const start = first.getTime() - offset * DAY_MS;
  const next = new Date(shiftMonth(month, 1) + '-01T00:00:00Z').getTime();
  const weeks = Math.ceil((next - start) / DAY_MS / 7);
  return Array.from({ length: weeks * 7 }, (_, index) => new Date(start + index * DAY_MS).toISOString().slice(0, 10));
}

/**
 * The month calendar: each job sits on the day its fix is due. It is a table, so a screen reader announces the day
 * for every job, and each job is a link to the job itself.
 */
export function WorkOrderCalendar({
  items,
  month,
  now,
  prevHref,
  nextHref,
  dayHref,
}: {
  items: WorkOrderSummary[];
  month: string;
  now: number;
  prevHref: string;
  nextHref: string;
  dayHref: (day: string) => string;
}) {
  const days = calendarDays(month);
  const today = ukDay(now);
  const byDay = new Map<string, WorkOrderSummary[]>();
  for (const item of items) {
    if (!item.fixDueAt) continue;
    const day = ukDay(item.fixDueAt);
    byDay.set(day, [...(byDay.get(day) ?? []), item]);
  }
  const title = new Date(month + '-01T00:00:00Z').toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const tone = (item: WorkOrderSummary) => {
    if (!item.fixDueAt || WORK_ORDER_FINISHED.includes(item.status)) return '';
    const due = new Date(item.fixDueAt).getTime();
    if (!item.slaPausedAt && due < now) return styles.eventLate;
    return due - now < SOON_MS ? styles.eventSoon : '';
  };
  return (
    <div className="stack g3">
      <div className="row between g2">
        <Link className="btn sm" href={prevHref}>
          Previous month
        </Link>
        <h2 className="card-t" aria-live="polite">
          {title}
        </h2>
        <Link className="btn sm" href={nextHref}>
          Next month
        </Link>
      </div>
      <div className={styles.calendarScroll}>
        <table className={styles.calendar}>
          <caption className="sr-only">Work orders by the day their fix is due, {title}</caption>
          <thead>
            <tr>
              {WEEKDAYS.map((day) => (
                <th key={day} scope="col">
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: days.length / 7 }, (_, week) => (
              <tr key={days[week * 7]}>
                {days.slice(week * 7, week * 7 + 7).map((day) => {
                  const jobs = byDay.get(day) ?? [];
                  const inMonth = day.startsWith(month);
                  const label = new Date(day + 'T00:00:00Z').toLocaleDateString('en-GB', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    timeZone: 'UTC',
                  });
                  return (
                    <td
                      key={day}
                      className={
                        styles.day +
                        (inMonth ? '' : ' ' + styles.dayOutside) +
                        (jobs.length ? '' : ' ' + styles.dayEmpty)
                      }
                    >
                      <p className={styles.dayNumber + (day === today ? ' ' + styles.dayToday : '')}>
                        <span aria-hidden="true" className={styles.shortDay}>
                          {Number(day.slice(8))}
                        </span>
                        <span className={styles.longDay}>
                          {label}
                          {day === today ? ', today' : ''}
                          {jobs.length ? ', ' + jobs.length + (jobs.length === 1 ? ' job' : ' jobs') : ''}
                        </span>
                      </p>
                      {jobs.length > 0 && (
                        <ul className={styles.events}>
                          {jobs.slice(0, MAX_PER_DAY).map((item) => (
                            <li key={item.id}>
                              <Link
                                className={styles.event + ' ' + tone(item)}
                                href={'/app/work-orders/' + item.id}
                                title={item.number + ' ' + item.title}
                              >
                                {item.number.split('-').at(-1)} {item.title}
                              </Link>
                            </li>
                          ))}
                          {jobs.length > MAX_PER_DAY && (
                            <li>
                              <Link className="xs muted" href={dayHref(day)}>
                                +{jobs.length - MAX_PER_DAY} more
                                <span className="sr-only"> on {label}</span>
                              </Link>
                            </li>
                          )}
                        </ul>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
