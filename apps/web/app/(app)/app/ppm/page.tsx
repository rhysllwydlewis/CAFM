import type { Metadata } from 'next';
import Link from 'next/link';
import { can, feature, formatMinor, PPM_CRITICALITIES, PPM_CRITICALITY_LABELS } from '@cafm/shared';
import { Icon } from '@cafm/ui';
import { hours } from '@/lib/ppm-format';
import { ppmForecast, ppmOverdue, ppmPlanner, ppmSchedules, ppmSummary } from '@/lib/ppm';
import { currentUser } from '@/lib/session';
import { ListViewBar } from '@/components/list-view-bar';
import ModulePage from '../[module]/page';
import { GenerateButton } from './generate-button';
import { PlannerGrid, PlannerLegend } from './planner-grid';
import { ComplianceTable, ForecastTable, OverdueTable, ScheduleTable } from './ppm-tables';
import styles from './ppm.module.css';

export const metadata: Metadata = { title: 'Planned maintenance' };

const VIEWS = [
  ['planner', 'Planner'],
  ['list', 'Schedules'],
  ['forecast', 'Forecast'],
  ['overdue', 'Overdue'],
  ['compliance', 'Compliance'],
] as const;
type View = (typeof VIEWS)[number][0];

const PAGE_SIZE = 50;
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
  };
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
        : view === 'forecast'
          ? await ppmForecast(12)
          : view === 'overdue'
            ? await ppmOverdue()
            : null;

  const hrefFor = (target: View) => {
    const next = new URLSearchParams();
    if (target !== 'planner') next.set('view', target);
    for (const key of ['q', 'criticality', 'discipline'] as const)
      if (filters[key] && (target === 'planner' || target === 'list')) next.set(key, filters[key]!);
    return '/app/ppm' + (next.size ? '?' + next.toString() : '');
  };

  const pageHref = (target: number) => {
    const next = new URLSearchParams({ view: 'list' });
    for (const key of ['q', 'criticality', 'discipline', 'status'] as const)
      if (filters[key]) next.set(key, filters[key]!);
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

        {(view === 'planner' || view === 'list') && (
          <form key={JSON.stringify(filters)} className={styles.filters} aria-label="Filter schedules">
            {view !== 'planner' && <input type="hidden" name="view" value={view} />}
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
            {view === 'list' && (
              <label className="field">
                <span className="label">Status</span>
                <select className={styles.control} name="status" defaultValue={filters.status ?? 'active'}>
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                  <option value="all">All</option>
                </select>
              </label>
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
            <ScheduleTable items={data.items} />
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
