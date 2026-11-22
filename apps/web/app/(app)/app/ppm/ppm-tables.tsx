import Link from 'next/link';
import {
  frequencyText,
  PPM_MODE_LABELS,
  formatMinor,
  type PpmComplianceGroup,
  type PpmForecast,
  type PpmOverdueItem,
  type PpmScheduleSummary,
} from '@cafm/shared';
import { criticalityBadge, criticalityLabel, hours, longDay, monthName } from '@/lib/ppm-format';
import styles from './ppm.module.css';

export function ScheduleTable({ items }: { items: PpmScheduleSummary[] }) {
  if (!items.length) return <p className="card-b muted">No schedules match.</p>;
  return (
    <div className={styles.tableWrap} role="region" aria-label="Schedules" tabIndex={0}>
      <table className="tbl">
        <thead>
          <tr>
            {['Schedule', 'How often', 'Assets', 'Next due', 'Overdue', 'Assigned to'].map((label) => (
              <th key={label} scope="col">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>
                <Link href={'/app/ppm/schedules/' + item.id} className="medium">
                  {item.title}
                </Link>
                <div className="row wrap g2 sm">
                  <span className="muted">{item.number}</span>
                  <span className={'badge ' + criticalityBadge(item.criticality)}>
                    {criticalityLabel(item.criticality)}
                  </span>
                  {!item.active && <span className="badge outline">Archived</span>}
                </div>
              </td>
              <td>
                {frequencyText(item.frequency)}
                <div className="sm muted">{PPM_MODE_LABELS[item.mode]}</div>
              </td>
              <td>{item.assets}</td>
              <td>{item.nextDueOn ? longDay(item.nextDueOn) : item.frequency.type === 'meter' ? 'By meter' : '—'}</td>
              <td>{item.overdue ? <span className="badge danger">{item.overdue}</span> : '0'}</td>
              <td>{item.assigneeName ?? <span className="muted">Unassigned</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ForecastTable({ forecast }: { forecast: PpmForecast }) {
  const seesCosts = forecast.months.some((month) => month.costMinor !== null);
  const total = forecast.months.reduce(
    (sum, month) => ({
      visits: sum.visits + month.visits,
      minutes: sum.minutes + month.labourMinutes,
      cost: sum.cost + (month.costMinor ?? 0),
      uncosted: sum.uncosted + month.uncosted,
    }),
    { visits: 0, minutes: 0, cost: 0, uncosted: 0 },
  );
  return (
    <div className="stack g3">
      <div className={styles.tableWrap} role="region" aria-label="Forecast by month" tabIndex={0}>
        <table className="tbl">
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Visits</th>
              <th scope="col">Labour</th>
              {seesCosts && <th scope="col">Estimated cost</th>}
            </tr>
          </thead>
          <tbody>
            {forecast.months.map((month) => (
              <tr key={month.month}>
                <th scope="row">{monthName(month.month)}</th>
                <td>{month.visits}</td>
                <td>{hours(month.labourMinutes)} h</td>
                {seesCosts && (
                  <td>
                    {formatMinor(month.costMinor ?? 0, forecast.currency)}
                    {month.uncosted > 0 && <div className="sm muted">{month.uncosted} without an estimate</div>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td>{total.visits}</td>
              <td>{hours(total.minutes)} h</td>
              {seesCosts && <td>{formatMinor(total.cost, forecast.currency)}</td>}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="sm muted card-b">
        Visits still to come, from each schedule’s next date and how often it repeats, at the time each is expected to
        take. Late visits are on the overdue list.
        {forecast.meterSchedules > 0 &&
          ` ${forecast.meterSchedules} ${forecast.meterSchedules === 1 ? 'schedule is' : 'schedules are'} based on a meter and can’t be placed in a month, so ${forecast.meterSchedules === 1 ? 'it isn’t' : 'they aren’t'} counted.`}
      </p>
    </div>
  );
}

export function OverdueTable({ items }: { items: PpmOverdueItem[] }) {
  if (!items.length) return <p className="card-b muted">Nothing is overdue.</p>;
  return (
    <div className={styles.tableWrap} role="region" aria-label="Overdue visits" tabIndex={0}>
      <table className="tbl">
        <thead>
          <tr>
            {['Visit', 'Asset', 'Due', 'Late by', 'Assigned to'].map((label) => (
              <th key={label} scope="col">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.jobId}>
              <td>
                <Link href={'/app/work-orders/' + item.jobId} className="medium">
                  {item.number}
                </Link>
                <div className="sm">{item.title}</div>
                <div className="row wrap g2 sm">
                  <Link href={'/app/ppm/schedules/' + item.scheduleId}>{item.scheduleNumber}</Link>
                  <span className={'badge ' + criticalityBadge(item.criticality)}>
                    {criticalityLabel(item.criticality)}
                  </span>
                </div>
              </td>
              <td>
                {item.asset ? `${item.asset.name} (${item.asset.number})` : '—'}
                <div className="sm muted">{item.location}</div>
              </td>
              <td>{longDay(item.dueOn)}</td>
              <td>
                {item.daysLate} {item.daysLate === 1 ? 'day' : 'days'}
              </td>
              <td>{item.assigneeName ?? <span className="muted">Unassigned</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ComplianceTable({ title, groups }: { title: string; groups: PpmComplianceGroup[] }) {
  if (!groups.length) return null;
  return (
    <div className={styles.tableWrap} role="region" aria-label={title} tabIndex={0}>
      <table className="tbl">
        <thead>
          <tr>
            <th scope="col">{title}</th>
            <th scope="col">Share on time</th>
            <th scope="col">Done on time</th>
            <th scope="col">Done late</th>
            <th scope="col">Overdue</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <tr key={group.key}>
              <th scope="row">{group.label}</th>
              <td>{group.percent === null ? '—' : group.percent.toFixed(1) + '%'}</td>
              <td>{group.onTime}</td>
              <td>{group.late}</td>
              <td>{group.overdue}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
