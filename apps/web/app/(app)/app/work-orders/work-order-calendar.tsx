import { WORK_ORDER_FINISHED, type WorkOrderSummary } from '@fmstead/shared';
import { DAY_MS, MonthCalendar, ukDay, type CalendarEvent } from '@/components/month-calendar';

/** A job due within this long is shown as due soon. */
const SOON_MS = 2 * DAY_MS;

/** The month calendar for work orders: each job sits on the day its fix is due and links to the job. */
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
  const events: CalendarEvent[] = [];
  for (const item of items) {
    if (!item.fixDueAt) continue;
    const due = new Date(item.fixDueAt).getTime();
    const open = !WORK_ORDER_FINISHED.includes(item.status);
    events.push({
      id: item.id,
      day: ukDay(due),
      href: '/app/work-orders/' + item.id,
      label: item.number.split('-').at(-1) + ' ' + item.title,
      title: item.number + ' ' + item.title,
      tone: !open ? undefined : !item.slaPausedAt && due < now ? 'late' : due - now < SOON_MS ? 'soon' : undefined,
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
      noun="job"
      plural="jobs"
      caption="Work orders by the day their fix is due"
    />
  );
}
