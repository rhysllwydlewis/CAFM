import { Temporal } from '@js-temporal/polyfill';
import { siteBusinessHoursOn, type SiteCalendar } from '@fmstead/shared';

/** The clock runs only in real instants inside the site's local opening windows. */
export function requestDeadline(start: Date, minutes: number, calendar: SiteCalendar | null): Date | null {
  let remaining = minutes * 60_000;
  if (!calendar) return new Date(start.getTime() + remaining);
  if (!calendar.hours.length) return null;

  const firstDay = Temporal.Instant.fromEpochMilliseconds(start.getTime())
    .toZonedDateTimeISO(calendar.timeZone)
    .toPlainDate();
  let cursor = start.getTime();
  for (let offset = 0; offset <= 730; offset++) {
    const day = firstDay.add({ days: offset });
    for (const window of siteBusinessHoursOn(calendar, day.toString())) {
      const opens = day.toPlainDateTime(window.opens).toZonedDateTime(calendar.timeZone).epochMilliseconds;
      // A window may end at 24:00 (midnight at the end of the day), which Temporal has no time for.
      const closing =
        window.closes === '24:00' ? day.add({ days: 1 }).toPlainDateTime('00:00') : day.toPlainDateTime(window.closes);
      const closes = closing.toZonedDateTime(calendar.timeZone, { disambiguation: 'later' }).epochMilliseconds;
      const from = Math.max(opens, cursor);
      if (closes <= from) continue;
      const available = closes - from;
      if (available >= remaining) return new Date(from + remaining);
      remaining -= available;
      cursor = closes;
    }
  }
  return null;
}

/**
 * The minutes between two instants that count towards a target: all of them for a round-the-clock target,
 * and only those inside the site's opening windows otherwise. It is the other half of `requestDeadline`.
 */
export function elapsedMinutes(start: Date, end: Date, calendar: SiteCalendar | null): number {
  if (end <= start) return 0;
  if (!calendar) return (end.getTime() - start.getTime()) / 60_000;
  if (!calendar.hours.length) return 0;

  const firstDay = Temporal.Instant.fromEpochMilliseconds(start.getTime())
    .toZonedDateTimeISO(calendar.timeZone)
    .toPlainDate();
  let total = 0;
  let cursor = start.getTime();
  for (let offset = 0; offset <= 730; offset++) {
    const day = firstDay.add({ days: offset });
    for (const window of siteBusinessHoursOn(calendar, day.toString())) {
      const opens = day.toPlainDateTime(window.opens).toZonedDateTime(calendar.timeZone).epochMilliseconds;
      const closing =
        window.closes === '24:00' ? day.add({ days: 1 }).toPlainDateTime('00:00') : day.toPlainDateTime(window.closes);
      const closes = closing.toZonedDateTime(calendar.timeZone, { disambiguation: 'later' }).epochMilliseconds;
      const from = Math.max(opens, cursor);
      const to = Math.min(closes, end.getTime());
      if (to > from) {
        total += to - from;
        cursor = to;
      }
      if (closes >= end.getTime()) return total / 60_000;
    }
  }
  return total / 60_000;
}
