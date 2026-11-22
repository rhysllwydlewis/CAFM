import { Temporal } from '@js-temporal/polyfill';
import { siteBusinessHoursOn, type SiteCalendar } from '@cafm/shared';

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
      const closes = day
        .toPlainDateTime(window.closes)
        .toZonedDateTime(calendar.timeZone, { disambiguation: 'later' }).epochMilliseconds;
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
