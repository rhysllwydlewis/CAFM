import type { Metadata } from 'next';
import Link from 'next/link';
import { can, feature, formatMinor } from '@fmstead/shared';
import { currentUser } from '@/lib/session';
import { costAnalysis, openJobsByAge, ppmCompliance, satisfaction, slaPerformance, workMix } from '@/lib/reports';
import ModulePage from '../[module]/page';
import styles from './reports.module.css';

export const metadata: Metadata = { title: 'Reports' };

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || undefined;
const percent = (value: number | null) => (value === null ? '—' : value + '%');
const date = (day: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(day + 'T00:00:00Z'),
  );

/** The standard report library: fixed reports over the jobs the person may see (doc 02 §28). */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await currentUser();
  if (!feature(user.entitlements, 'reports') || !can(user, 'reports.read')) {
    return ModulePage({ params: Promise.resolve({ module: 'reports' }) });
  }
  const input = await searchParams;
  const from = DAY.test(one(input.from) ?? '') ? one(input.from) : undefined;
  const to = DAY.test(one(input.to) ?? '') ? one(input.to) : undefined;
  const invalid = Boolean(from && to && from > to);
  const period = invalid ? {} : { from, to };
  const seesSatisfaction = feature(user.entitlements, 'helpdesk') && can(user, 'requests.manage');
  const seesCosts = feature(user.entitlements, 'work_orders') && can(user, 'costs.read');
  const [age, sla, ppm, mix, rated, costs] = await Promise.all([
    openJobsByAge(),
    slaPerformance(period),
    ppmCompliance(period),
    workMix(period),
    seesSatisfaction ? satisfaction(period) : null,
    seesCosts ? costAnalysis(period) : null,
  ]);

  return (
    <div className="page stack g4">
      <div className="page-head">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-sub">
            Standard reports for {date(sla.from)} to {date(sla.to)}. They cover the sites you can see.
          </p>
        </div>
        <Link href="/app/reports/executive" className="btn">
          Executive overview
        </Link>
      </div>

      <form method="get" className={styles.period} aria-label="Reporting period">
        <label className="stack g1">
          <span className="sm muted">From</span>
          <span className="input">
            <input type="date" name="from" defaultValue={sla.from} />
          </span>
        </label>
        <label className="stack g1">
          <span className="sm muted">To</span>
          <span className="input">
            <input type="date" name="to" defaultValue={sla.to} />
          </span>
        </label>
        <button type="submit" className="btn">
          Update
        </button>
      </form>
      {invalid && (
        <div className="callout" role="alert">
          <div className="grow">The start date is after the end date, so the last 30 days are shown.</div>
        </div>
      )}

      <section className="card stack g3" aria-labelledby="r-age">
        <div className="card-b stack g3">
          <h2 id="r-age" className="h3">
            Open jobs by age
          </h2>
          <p className="sm muted">
            {age.total} open {age.total === 1 ? 'job' : 'jobs'}, by days since they were logged.
          </p>
          <div className={styles.metrics}>
            {age.bands.map((band) => (
              <div className="stack g1" key={band.key}>
                <span className="sm muted">{band.label}</span>
                <strong className="page-title">{band.count}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="card stack g3" aria-labelledby="r-sla">
        <div className="card-b stack g3">
          <h2 id="r-sla" className="h3">
            SLA performance
          </h2>
          <p className="sm muted">
            Jobs completed in the period that had a fix target: {percent(sla.percentMet)} met ({sla.met} of{' '}
            {sla.measured}).
          </p>
          {sla.byPriority.length > 0 ? (
            <div className={styles.tableWrap} role="region" aria-label="SLA performance by priority" tabIndex={0}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th scope="col">Priority</th>
                    <th scope="col">Measured</th>
                    <th scope="col">Met</th>
                    <th scope="col">Share met</th>
                  </tr>
                </thead>
                <tbody>
                  {sla.byPriority.map((row) => (
                    <tr key={row.priority}>
                      <th scope="row">P{row.priority}</th>
                      <td>{row.measured}</td>
                      <td>{row.met}</td>
                      <td>{percent(Math.round((row.met / row.measured) * 100))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted">No jobs with a fix target were completed in this period.</p>
          )}
        </div>
      </section>

      <section className="card stack g3" aria-labelledby="r-ppm">
        <div className="card-b stack g3">
          <h2 id="r-ppm" className="h3">
            PPM compliance
          </h2>
          <p className="sm muted">
            Planned visits due in the period: {percent(ppm.percentOnTime)} done on time, of those whose day has passed.
          </p>
          <div className={styles.metrics}>
            {(
              [
                ['Due', ppm.due],
                ['Done on time', ppm.onTime],
                ['Done late', ppm.late],
                ['Overdue', ppm.overdue],
                ['Still to come', ppm.upcoming],
              ] as const
            ).map(([label, value]) => (
              <div className="stack g1" key={label}>
                <span className="sm muted">{label}</span>
                <strong className="page-title">{value}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="card stack g3" aria-labelledby="r-mix">
        <div className="card-b stack g3">
          <h2 id="r-mix" className="h3">
            Reactive and planned work
          </h2>
          <p className="sm muted">
            Jobs raised in the period: {percent(mix.percentReactive)} were reactive ({mix.reactive} reactive,{' '}
            {mix.planned} planned).
          </p>
        </div>
      </section>
      {rated && (
        <section className="card stack g3" aria-labelledby="r-csat">
          <div className="card-b stack g3">
            <h2 id="r-csat" className="h3">
              Satisfaction
            </h2>
            <p className="sm muted">
              {rated.rated === 0
                ? 'No requests were rated in this period.'
                : `Requests rated in the period: ${rated.average} out of 5 on average (${rated.rated} ${rated.rated === 1 ? 'rating' : 'ratings'}).`}
            </p>
            <div className={styles.metrics}>
              {rated.byRating.map((row) => (
                <div className="stack g1" key={row.rating}>
                  <span className="sm muted">{row.rating === 1 ? '1 star' : `${row.rating} stars`}</span>
                  <strong className="page-title">{row.count}</strong>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
      {costs && (
        <section className="card stack g3" aria-labelledby="r-cost">
          <div className="card-b stack g3">
            <h2 id="r-cost" className="h3">
              Cost analysis
            </h2>
            <p className="sm muted">Cost entered on jobs in the period, by the day it was incurred.</p>
            {costs.currencies.length > 0 ? (
              <div className={styles.tableWrap} role="region" aria-label="Cost by type" tabIndex={0}>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th scope="col">Currency</th>
                      <th scope="col">Type</th>
                      <th scope="col">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costs.currencies.flatMap((c) => [
                      ...c.byKind.map((row) => (
                        <tr key={c.currency + row.kind}>
                          <th scope="row">{c.currency}</th>
                          <td>{row.kind.charAt(0).toUpperCase() + row.kind.slice(1)}</td>
                          <td>{formatMinor(row.amountMinor, c.currency)}</td>
                        </tr>
                      )),
                      <tr key={c.currency + 'total'}>
                        <th scope="row">{c.currency}</th>
                        <td>
                          <strong>Total</strong>
                        </td>
                        <td>
                          <strong>{formatMinor(c.totalMinor, c.currency)}</strong>
                        </td>
                      </tr>,
                    ])}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">No cost was entered in this period.</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
