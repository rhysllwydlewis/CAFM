import { z } from 'zod';
import holidays from './uk-bank-holidays.json';

export const SITE_JURISDICTIONS = {
  england: 'England',
  wales: 'Wales',
  scotland: 'Scotland',
  'northern-ireland': 'Northern Ireland',
  other: 'Other',
} as const;
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

export const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Enter a real calendar date.');

const TIME_MESSAGE = 'Enter a time as hours and minutes, like 09:00.';
const TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const openTime = z.string().regex(TIME, TIME_MESSAGE);
const closeTime = z.string().refine((value) => TIME.test(value) || value === '24:00', TIME_MESSAGE);
const timeZone = z
  .string()
  .trim()
  .max(64)
  .transform((value, ctx) => {
    try {
      // The standard spelling, so "europe/london" is stored as "Europe/London".
      return new Intl.DateTimeFormat('en-GB', { timeZone: value }).resolvedOptions().timeZone;
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid IANA time zone.' });
      return z.NEVER;
    }
  });

export const siteCalendarSchema = z
  .object({
    jurisdiction: z.enum(['england', 'wales', 'scotland', 'northern-ireland', 'other']),
    timeZone,
    observeBankHolidays: z.boolean(),
    hours: z
      .array(
        z
          .object({
            day: z.number().int().min(1).max(7),
            opens: openTime,
            closes: closeTime,
          })
          .strict(),
      )
      .max(28),
    closures: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(100),
            from: calendarDate,
            to: calendarDate,
          })
          .strict(),
      )
      .max(100),
  })
  .strict()
  .superRefine(({ hours, closures }, ctx) => {
    // Order and overlap only mean something once every time is well formed.
    const valid = (window: { opens: string; closes: string }) =>
      TIME.test(window.opens) && (TIME.test(window.closes) || window.closes === '24:00');
    for (const [index, window] of hours.entries()) {
      if (!valid(window)) continue;
      if (window.opens >= window.closes)
        ctx.addIssue({ code: 'custom', path: ['hours', index], message: 'Closing time must be after opening time.' });
      if (
        hours
          .slice(0, index)
          .some(
            (other) =>
              valid(other) && other.day === window.day && other.opens < window.closes && window.opens < other.closes,
          )
      )
        ctx.addIssue({
          code: 'custom',
          path: ['hours', index],
          message: 'Opening hours on the same day cannot overlap.',
        });
    }
    for (const [index, closure] of closures.entries()) {
      if (closure.from > closure.to)
        ctx.addIssue({
          code: 'custom',
          path: ['closures', index],
          message: 'End date must be on or after the start date.',
        });
    }
  });

export type SiteCalendar = z.infer<typeof siteCalendarSchema>;
export const DEFAULT_SITE_CALENDAR: SiteCalendar = {
  jurisdiction: 'other',
  timeZone: 'Europe/London',
  observeBankHolidays: true,
  closures: [],
  hours: [1, 2, 3, 4, 5].map((day) => ({ day, opens: '09:00', closes: '17:00' })),
};

export function bankHolidays(
  jurisdiction: SiteCalendar['jurisdiction'],
): ReadonlyArray<{ date: string; title: string }> {
  if (jurisdiction === 'other') return [];
  const division = jurisdiction === 'england' || jurisdiction === 'wales' ? 'england-and-wales' : jurisdiction;
  return holidays[division];
}

/** Local-day availability for SLA calculations. Convert instants to the site's time zone before calling. */
export function siteBusinessHoursOn(calendar: SiteCalendar, localDate: string): SiteCalendar['hours'] {
  const date = calendarDate.parse(localDate);
  const closures = calendar.closures.some(({ from, to }) => from <= date && date <= to);
  const holiday =
    calendar.observeBankHolidays && bankHolidays(calendar.jurisdiction).some((entry) => entry.date === date);
  if (closures || holiday) return [];
  const day = new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
  return calendar.hours.filter((window) => window.day === day).sort((a, b) => a.opens.localeCompare(b.opens));
}
