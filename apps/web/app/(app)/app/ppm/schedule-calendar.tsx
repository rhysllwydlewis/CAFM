import type { PpmScheduleSummary } from '@cafm/shared';
import { DAY_MS, MonthCalendar, ukDay, type CalendarEvent } from '@/components/month-calendar';

/** A schedule due within this many days is shown as due soon. */
const SOON_DAYS = 2;

/**
 * The month calendar for planned maintenance: each schedule sits on the day its next visit is due, the earliest
 * of its assets, and links to the schedule. Schedules with no date (meter-based, or not yet planned) are left off.
 */
export function ScheduleCalendar({
  items,
  month,
  now,
  prevHref,
  nextHref,
  dayHref,
}: {
  items: PpmScheduleSummary[];
  month: string;
  now: number;
  prevHref: string;
  nextHref: string;
  dayHref: (day: string) => string;
}) {
  const today = ukDay(now);
  const soon = ukDay(now + SOON_DAYS * DAY_MS);
  const events: CalendarEvent[] = [];
  for (const item of items) {
    if (!item.nextDueOn) continue;
    events.push({
      id: item.id,
      day: item.nextDueOn,
      href: '/app/ppm/schedules/' + item.id,
      label: item.number + ' ' + item.title,
      title: item.number + ' ' + item.title + ', ' + item.assets + (item.assets === 1 ? ' asset' : ' assets'),
      tone: item.nextDueOn < today ? 'late' : item.nextDueOn <= soon ? 'soon' : undefined,
    });
  }
  return (
    <MonthCalendar
      events={events}
      month={month}
      now={now}
      prevHref={prevHref}
      nextHref={nextHref}
      dayHref={dayHref}
      noun="schedule"
      plural="schedules"
      caption="Schedules by the day their next visit is due"
    />
  );
}
