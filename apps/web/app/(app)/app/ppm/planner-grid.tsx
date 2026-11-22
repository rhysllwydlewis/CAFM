import Link from 'next/link';
import { isoWeek, frequencyText, type PpmPlanner, type PpmWeekCounts } from '@cafm/shared';
import { monthAbbr, shortDay, criticalityBadge, criticalityLabel } from '@/lib/ppm-format';
import styles from './ppm.module.css';

const STATES: { key: keyof PpmWeekCounts; label: string; dot: string }[] = [
  { key: 'overdue', label: 'overdue', dot: styles.dotOverdue! },
  { key: 'due', label: 'due', dot: styles.dotDue! },
  { key: 'scheduled', label: 'scheduled', dot: styles.dotScheduled! },
  { key: 'completed', label: 'done', dot: styles.dotCompleted! },
];

/** What a week holds, in words, for people who can't see the colours. */
function describe(cell: PpmWeekCounts) {
  return STATES.filter(({ key }) => cell[key] > 0)
    .map(({ key, label }) => `${cell[key]} ${label}`)
    .join(', ');
}

function Cell({ cell, weekStart }: { cell: PpmWeekCounts | undefined; weekStart: string }) {
  if (!cell) return null;
  // The most pressing state shows; the words carry the rest.
  const lead = STATES.find(({ key }) => cell[key] > 0);
  if (!lead) return null;
  const total = STATES.reduce((count, { key }) => count + cell[key], 0);
  return (
    <span className={styles.cell} title={`Week of ${shortDay(weekStart)}: ${describe(cell)}`}>
      <span className={styles.dot + ' ' + lead.dot} aria-hidden="true" />
      {total > 1 && <span aria-hidden="true">{total}</span>}
      <span className="sr-only">
        Week of {shortDay(weekStart)}: {describe(cell)}
      </span>
    </span>
  );
}

/** The 52-week planner: one row to a schedule, one column to a week, with a dot for what is due in it. */
export function PlannerGrid({ planner }: { planner: PpmPlanner }) {
  const months: { label: string; span: number }[] = [];
  planner.weekStarts.forEach((start, index) => {
    const label = monthAbbr(start) + (start.slice(5, 7) === '01' || index === 0 ? ' ' + start.slice(0, 4) : '');
    const last = months.at(-1);
    if (last && last.label.slice(0, 3) === label.slice(0, 3)) last.span += 1;
    else months.push({ label, span: 1 });
  });
  const monthStarts = new Set(
    planner.weekStarts.flatMap((start, index) =>
      index === 0 || start.slice(0, 7) !== planner.weekStarts[index - 1]!.slice(0, 7) ? [index] : [],
    ),
  );
  const thisWeek = planner.weekStarts.findIndex(
    (start) => start <= planner.today && planner.today < addSevenDays(start),
  );
  return (
    <div className={styles.gridWrap} role="region" aria-label="Planner, by week" tabIndex={0}>
      <table className={styles.grid}>
        <caption className="sr-only">
          Planned maintenance by week, from the week of {shortDay(planner.weekStarts[0]!)}. A dot in a week means visits
          are due in it.
        </caption>
        <thead>
          <tr>
            <th scope="col" rowSpan={2} className={styles.sticky}>
              Schedule
            </th>
            {months.map((month, index) => (
              <th key={index} scope="colgroup" colSpan={month.span} className={index ? styles.monthStart : undefined}>
                {month.label}
              </th>
            ))}
          </tr>
          <tr>
            {planner.weekStarts.map((start, index) => (
              <th
                key={start}
                scope="col"
                className={[monthStarts.has(index) ? styles.monthStart : '', index === thisWeek ? styles.thisWeek : '']
                  .filter(Boolean)
                  .join(' ')}
                title={`Week of ${shortDay(start)}`}
              >
                <span aria-hidden="true">{isoWeek(start)}</span>
                <span className="sr-only">
                  Week {isoWeek(start)}, from {shortDay(start)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {planner.rows.map((row) => (
            <tr key={row.id}>
              <th scope="row" className={styles.sticky}>
                <Link href={'/app/ppm/schedules/' + row.id} className="medium">
                  {row.title}
                </Link>
                <div className="sm muted">
                  {row.number} · {row.assets} {row.assets === 1 ? 'asset' : 'assets'} · {frequencyText(row.frequency)}
                </div>
                <div className="row wrap g2 sm">
                  <span className={'badge ' + criticalityBadge(row.criticality)}>
                    {criticalityLabel(row.criticality)}
                  </span>
                  <span className="muted">{row.assigneeName ?? 'Unassigned'}</span>
                </div>
              </th>
              {planner.weekStarts.map((start, index) => (
                <td
                  key={start}
                  className={[
                    monthStarts.has(index) ? styles.monthStart : '',
                    index === thisWeek ? styles.thisWeek : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <Cell cell={row.weeks[index]} weekStart={start} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className={styles.sticky}>
              Visits each week
            </th>
            {planner.totals.map((week, index) => {
              const total = week.scheduled + week.due + week.overdue + week.completed;
              return (
                <td key={planner.weekStarts[index]} className={monthStarts.has(index) ? styles.monthStart : undefined}>
                  {total || ''}
                </td>
              );
            })}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function addSevenDays(value: string) {
  const date = new Date(value + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + 7);
  return date.toISOString().slice(0, 10);
}

export function PlannerLegend() {
  return (
    <div className={styles.legend} aria-label="Key">
      <span>
        <span className={styles.dot + ' ' + styles.dotScheduled} aria-hidden="true" /> Scheduled
      </span>
      <span>
        <span className={styles.dot + ' ' + styles.dotDue} aria-hidden="true" /> Due (job raised)
      </span>
      <span>
        <span className={styles.dot + ' ' + styles.dotOverdue} aria-hidden="true" /> Overdue
      </span>
      <span>
        <span className={styles.dot + ' ' + styles.dotCompleted} aria-hidden="true" /> Done
      </span>
    </div>
  );
}
