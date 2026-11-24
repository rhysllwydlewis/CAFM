import type { Metadata } from 'next';
import Link from 'next/link';
import {
  can,
  feature,
  formatMinor,
  parseColumnKeys,
  parseGroup,
  PPM_CRITICALITIES,
  PPM_CRITICALITY_LABELS,
  PPM_SORTS,
} from '@cafm/shared';
import { Icon } from '@cafm/ui';
import { hours } from '@/lib/ppm-format';
import { ppmAssignees, ppmForecast, ppmOverdue, ppmPlanner, ppmSchedules, ppmSummary } from '@/lib/ppm';
import { BulkSelection } from '@/components/bulk-selection';
import { ScheduleBulkBar } from './schedule-bulk-bar';
import { currentUser } from '@/lib/session';
import { ListViewBar } from '@/components/list-view-bar';
import ModulePage from '../[module]/page';
import { GenerateButton } from './generate-button';
import { calendarMonth, shiftMonth, ukDay } from '@/components/month-calendar';
import { ScheduleCalendar } from './schedule-calendar';
import { PlannerGrid, PlannerLegend } from './planner-grid';
import { ListDisplayFields } from '@/components/list-display';
import {
  ComplianceTable,
  ForecastTable,
  OverdueTable,
  SCHEDULE_COLUMNS,
  SCHEDULE_GROUPS,
  ScheduleTable,
} from './ppm-tables';
import styles from './ppm.module.css';

export const metadata: Metadata = { title: 'Planned maintenance' };

const VIEWS = [
  ['planner', 'Planner'],
  ['list', 'Schedules'],
  ['calendar', 'Calendar'],
  ['forecast', 'Forecast'],
  ['overdue', 'Overdue'],
  ['compliance', 'Compliance'],
] as const;
type View = (typeof VIEWS)[number][0];

const PAGE_SIZE = 50;
/** The calendar shows what it finds all in one go, so it asks for the most the API gives. */
const CALENDAR_LIMIT = 100;
const SORT_LABELS = { number: 'Reference', title: 'Title', priority: 'Priority' } as const;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || undefined;

export default async function PpmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await currentUser();
  if (!feature(user.entitlements, 'ppm') || !can(user, 'ppm.read')) {
    return ModulePage({ params: Promise.resolve({ module: 'ppm' }) });
  }
  const input = await searchParams;
  const requested = one(input.view);
  const view: View = VIEWS.some(([key]) => key === requested) ? (requested as View) : 'planner';
  const filters = {
    q: one(input.q),
    criticality: PPM_CRITICALITIES.some((key) => key === one(input.criticality)) ? one(input.criticality) : undefined,
    discipline: one(input.discipline),
    status: one(input.status),
    sort: PPM_SORTS.find((key) => key === one(input.sort)),
    dir: ['asc', 'desc'].find((key) => key === one(input.dir)),
  };
  // How the page is shown. The API never sees these.
  const group = parseGroup(input.groupby, SCHEDULE_GROUPS);
  const cols = parseColumnKeys(input.cols).join(',') || undefined;
  const now = Date.now();
  const shown = calendarMonth(input.month, now);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(one(input.day) ?? '') ? one(input.day)! : undefined;
  const offset = Math.max(0, Math.floor(Number(one(input.offset))) || 0);
  const canManage = can(user, 'ppm.manage');
  const seesCosts = can(user, 'costs.read');

  const [summary, month] = await Promise.all([ppmSummary(), ppmForecast(1)]);
  const thisMonth = month.months[0]!;
  const change =
    summary.compliance.percent !== null && summary.previousCompliance.percent !== null
      ? Math.round((summary.compliance.percent - summary.previousCompliance.percent) * 10) / 10
      : null;
  const cards: { label: string; value: string; note: string; icon: string }[] = [
    {
      label: 'Due this week',
      value: String(summary.dueThisWeek),
      note: `${summary.dueThisWeekUnassigned} not yet given to anyone`,
      icon: 'calendar',
    },
    {
      label: 'Overdue',
      value: String(summary.overdue),
      note: `${summary.overdueStatutory} statutory`,
      icon: 'sla',
    },
    {
      label: 'On time, last 12 months',
      value: summary.compliance.percent === null ? '—' : summary.compliance.percent.toFixed(1) + '%',
      note:
        change === null
          ? 'No earlier year to compare with'
          : `${change > 0 ? '+' : ''}${change} points on the year before`,
      icon: 'approve',
    },
    {
      label: 'Labour this month',
      value: hours(thisMonth.labourMinutes) + ' h',
      note: `${thisMonth.visits} visits still to come`,
      icon: 'ppm',
    },
    ...(seesCosts
      ? [
          {
            label: 'Estimated cost this month',
            value: formatMinor(thisMonth.costMinor ?? 0, month.currency),
            note: thisMonth.uncosted
              ? `${thisMonth.uncosted} visits without an estimate`
              : 'From each schedule’s estimate',
            icon: 'finance',
          },
        ]
      : []),
  ];

  const data =
    view === 'planner'
      ? await ppmPlanner({ q: filters.q, criticality: filters.criticality, discipline: filters.discipline })
      : view === 'list'
        ? await ppmSchedules({ ...filters, limit: String(PAGE_SIZE), offset: offset ? String(offset) : undefined })
        : view === 'calendar'
          ? await ppmSchedules({ ...filters, sort: undefined, dir: undefined, limit: String(CALENDAR_LIMIT) })
          : view === 'forecast'
            ? await ppmForecast(12)
            : view === 'overdue'
              ? await ppmOverdue()
              : null;

  const hrefFor = (target: View) => {
    const next = new URLSearchParams();
    if (target !== 'planner') next.set('view', target);
    const searchable = target === 'planner' || target === 'list' || target === 'calendar';
    for (const key of ['q', 'criticality', 'discipline'] as const)
      if (filters[key] && searchable) next.set(key, filters[key]!);
    // Status only applies to the schedule list and the calendar, so it carries between those two.
    if (filters.status && (target === 'list' || target === 'calendar')) next.set('status', filters.status);
    return '/app/ppm' + (next.size ? '?' + next.toString() : '');
  };

  const calendarHref = (target: { month?: string; day?: string }) => {
    const next = new URLSearchParams({ view: 'calendar' });
    for (const key of ['q', 'criticality', 'discipline', 'status'] as const)
      if (filters[key]) next.set(key, filters[key]!);
    next.set('month', target.month ?? shown);
    if (target.day) next.set('day', target.day);
    return '/app/ppm?' + next.toString();
  };

  const pageHref = (target: number) => {
    const next = new URLSearchParams({ view: 'list' });
    for (const key of ['q', 'criticality', 'discipline', 'status', 'sort', 'dir'] as const)
      if (filters[key]) next.set(key, filters[key]!);
    if (group) next.set('groupby', group);
    if (cols) next.set('cols', cols);
    if (target) next.set('offset', String(target));
    return '/app/ppm?' + next.toString();
  };

  return (
    <div className="page stack g4">
      <div className="page-head">
        <div>
          <h1 className="page-title">Planned maintenance</h1>
          <p className="page-sub">
            {summary.schedules} {summary.schedules === 1 ? 'schedule' : 'schedules'}
            {summary.compliance.percent !== null &&
              ` · ${summary.compliance.percent.toFixed(1)}% done on time (last 12 months)`}
          </p>
        </div>
        <div className={'page-actions ' + styles.actions}>
          <Link href="/app/ppm/tasks" className="btn">
            Task library
          </Link>
          {canManage && (
            <>
              <GenerateButton path="/ppm/generate" label="Generate jobs now" />
              <Link href="/app/ppm/schedules/new" className="btn primary">
                <Icon name="add" /> New schedule
              </Link>
            </>
          )}
        </div>
      </div>

      <div className={styles.metrics}>
        {cards.map((card) => (
          <section className="card card-b stack g2" key={card.label}>
            <div className="row g2 muted">
              <Icon name={card.icon} />
              {card.label}
            </div>
            <strong className="page-title">{card.value}</strong>
            <span className="sm muted">{card.note}</span>
          </section>
        ))}
      </div>

      <ListViewBar entity="ppm_schedules" route="/app/ppm" query={input} user={user} />
      <section className="card">
        <nav aria-label="Planned maintenance views" className={styles.filters}>
          {VIEWS.map(([key, label]) => (
            <Link
              key={key}
              className={'btn sm ' + (key === view ? 'primary' : 'ghost')}
              aria-current={key === view ? 'page' : undefined}
              href={hrefFor(key)}
            >
              {label}
            </Link>
          ))}
        </nav>

        {(view === 'planner' || view === 'list' || view === 'calendar') && (
          <form
            key={JSON.stringify([filters, group, cols, shown])}
            className={styles.filters}
            aria-label="Filter schedules"
          >
            {view !== 'planner' && <input type="hidden" name="view" value={view} />}
            {view === 'calendar' && <input type="hidden" name="month" value={shown} />}
            {view === 'calendar' && day && <input type="hidden" name="day" value={day} />}
            <label className="field">
              <span className="label">Search schedules</span>
              <input className={styles.control} type="search" name="q" defaultValue={filters.q} />
            </label>
            <label className="field">
              <span className="label">Criticality</span>
              <select className={styles.control} name="criticality" defaultValue={filters.criticality ?? ''}>
                <option value="">All</option>
                {PPM_CRITICALITIES.map((key) => (
                  <option key={key} value={key}>
                    {PPM_CRITICALITY_LABELS[key]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="label">Discipline</span>
              <select className={styles.control} name="discipline" defaultValue={filters.discipline ?? ''}>
                <option value="">All</option>
                {summary.disciplines.map((discipline) => (
                  <option key={discipline} value={discipline}>
                    {discipline}
                  </option>
                ))}
              </select>
            </label>
            {(view === 'list' || view === 'calendar') && (
              <label className="field">
                <span className="label">Status</span>
                <select className={styles.control} name="status" defaultValue={filters.status ?? 'active'}>
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                  <option value="all">All</option>
                </select>
              </label>
            )}
            {view === 'list' && (
              <>
                <label className="field">
                  <span className="label">Sort by</span>
                  <select className={styles.control} name="sort" defaultValue={filters.sort ?? 'number'}>
                    {PPM_SORTS.map((sort) => (
                      <option key={sort} value={sort}>
                        {SORT_LABELS[sort]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="label">Sort order</span>
                  <select className={styles.control} name="dir" defaultValue={filters.dir ?? 'asc'}>
                    <option value="asc">Ascending</option>
                    <option value="desc">Descending</option>
                  </select>
                </label>
              </>
            )}
            {view === 'list' && (
              <ListDisplayFields columns={SCHEDULE_COLUMNS} groups={SCHEDULE_GROUPS} group={group} chosen={cols} />
            )}
            <button type="submit" className="btn">
              Apply filters
            </button>
          </form>
        )}

        {view === 'planner' && data && 'weekStarts' in data && (
          <>
            {data.rows.length === 0 ? (
              <p className="card-b muted">
                No schedules match. {canManage && 'Use New schedule to plan some maintenance.'}
              </p>
            ) : (
              <PlannerGrid planner={data} />
            )}
            <PlannerLegend />
            {data.meterSchedules > 0 && (
              <p className="card-b sm muted">
                {data.meterSchedules} {data.meterSchedules === 1 ? 'schedule is' : 'schedules are'} based on a meter, so{' '}
                {data.meterSchedules === 1 ? 'its' : 'their'} visits show only once the job is raised.
              </p>
            )}
          </>
        )}
        {view === 'list' && data && 'items' in data && (
          <>
            {canManage ? (
              <BulkSelection items={data.items.map(({ id, number, version }) => ({ id, label: number, version }))}>
                <ScheduleBulkBar assignees={await ppmAssignees().catch(() => [])} />
                <ScheduleTable items={data.items} columns={cols} group={group} bulk />
              </BulkSelection>
            ) : (
              <ScheduleTable items={data.items} columns={cols} group={group} />
            )}
            {data.total > PAGE_SIZE && (
              <nav aria-label="Schedule pages" className={'card-b row between wrap g2 ' + styles.pages}>
                <span className="sm muted">
                  {data.items.length
                    ? `Showing ${offset + 1} to ${offset + data.items.length} of ${data.total}`
                    : 'No more schedules'}
                </span>
                <span className="row g2">
                  {offset > 0 && (
                    <Link className="btn sm" href={pageHref(Math.max(0, offset - PAGE_SIZE))}>
                      Previous
                    </Link>
                  )}
                  {offset + PAGE_SIZE < data.total && (
                    <Link className="btn sm" href={pageHref(offset + PAGE_SIZE)}>
                      Next
                    </Link>
                  )}
                </span>
              </nav>
            )}
          </>
        )}
        {view === 'calendar' && data && 'items' in data && (
          <div className="card-b stack g3">
            {day ? (
              <>
                <p className="row between wrap g2">
                  <span>
                    Schedules next due on{' '}
                    {new Date(day + 'T00:00:00Z').toLocaleDateString('en-GB', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                      timeZone: 'UTC',
                    })}
                  </span>
                  <Link className="btn sm" href={calendarHref({ month: day.slice(0, 7) })}>
                    Show all dates
                  </Link>
                </p>
                <ScheduleTable items={data.items.filter((item) => item.nextDueOn === day)} />
              </>
            ) : (
              <ScheduleCalendar
                items={data.items}
                month={shown}
                now={now}
                prevHref={calendarHref({ month: shiftMonth(shown, -1) })}
                nextHref={calendarHref({ month: shiftMonth(shown, 1) })}
                dayHref={(target) => calendarHref({ month: shown, day: target })}
              />
            )}
            {data.total > CALENDAR_LIMIT && (
              <p className="sm muted">
                Showing the first {CALENDAR_LIMIT} of {data.total} schedules. Narrow the filters to see the rest.
              </p>
            )}
            <p className="sm muted">
              Each schedule is on the day its next visit is due. Meter-based schedules have no date, so they are not
              shown here. Today is {ukDay(now).split('-').reverse().join('/')}.
            </p>
          </div>
        )}
        {view === 'forecast' && data && 'months' in data && <ForecastTable forecast={data} />}
        {view === 'overdue' && Array.isArray(data) && (
          <OverdueTable items={data as Parameters<typeof OverdueTable>[0]['items']} />
        )}
        {view === 'compliance' && (
          <div className="stack g3 card-b">
            <p className="muted">
              {summary.compliance.percent === null
                ? 'No visits have fallen due in the last 12 months.'
                : `${summary.compliance.onTime} of ${summary.compliance.onTime + summary.compliance.late + summary.compliance.overdue} visits that fell due in the last 12 months were done on time. ${summary.compliance.late} were done late and ${summary.compliance.overdue} are overdue.`}
            </p>
            <ComplianceTable title="Criticality" groups={summary.byCriticality} />
            <ComplianceTable title="Discipline" groups={summary.byDiscipline} />
          </div>
        )}
      </section>
    </div>
  );
}
