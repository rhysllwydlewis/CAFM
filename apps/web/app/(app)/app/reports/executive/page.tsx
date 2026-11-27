import type { Metadata } from 'next';
import Link from 'next/link';
import { can, feature } from '@fmstead/shared';
import { currentUser } from '@/lib/session';
import { busiestSites, openJobsByAge, ppmCompliance, slaPerformance, workMix } from '@/lib/reports';
import ModulePage from '../../[module]/page';
import styles from './executive.module.css';

export const metadata: Metadata = { title: 'Executive overview' };

const percent = (value: number | null) => (value === null ? '—' : value + '%');
const date = (day: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(day + 'T00:00:00Z'),
  );

/** The executive overview (home-02): fixed key figures over the last 30 days, for the sites the person can see. */
export default async function ExecutiveOverviewPage() {
  const user = await currentUser();
  if (!feature(user.entitlements, 'reports') || !can(user, 'reports.read')) {
    return ModulePage({ params: Promise.resolve({ module: 'reports' }) });
  }
  const [age, sla, ppm, mix, sites] = await Promise.all([
    openJobsByAge(),
    slaPerformance({}),
    ppmCompliance({}),
    workMix({}),
    busiestSites({}),
  ]);
  const overOneMonth = age.bands.find((band) => band.key === '31+')?.count ?? 0;
  const topJobs = Math.max(1, ...sites.sites.map((site) => site.jobs));
  const figures = [
    { label: 'Open work orders', value: String(age.total), note: `${overOneMonth} open over 30 days` },
    { label: 'SLA met', value: percent(sla.percentMet), note: `${sla.met} of ${sla.measured} jobs` },
    { label: 'PPM done on time', value: percent(ppm.percentOnTime), note: `${ppm.overdue} overdue` },
    {
      label: 'Reactive share of work',
      value: percent(mix.percentReactive),
      note: `${mix.reactive} reactive, ${mix.planned} planned`,
    },
  ];

  return (
    <div className="page stack g4">
      <div className="page-head">
        <div>
          <h1 className="page-title">Executive overview</h1>
          <p className="page-sub">
            Portfolio performance, {date(sla.from)} to {date(sla.to)}. It covers the sites you can see.
          </p>
        </div>
        <Link href="/app/reports" className="btn">
          All reports
        </Link>
      </div>

      <section aria-label="Key figures" className={styles.tiles}>
        {figures.map((figure) => (
          <div className="card card-b stack g2" key={figure.label}>
            <span className="sm muted">{figure.label}</span>
            <strong className="page-title">{figure.value}</strong>
            <span className="sm muted">{figure.note}</span>
          </div>
        ))}
      </section>

      <section className="card" aria-labelledby="x-sites">
        <div className="card-b stack g3">
          <h2 id="x-sites" className="h3">
            Busiest sites
          </h2>
          <p className="sm muted">The five sites with the most jobs raised in the period.</p>
          {sites.sites.length > 0 ? (
            <ul className={styles.rows}>
              {sites.sites.map((site) => (
                <li key={site.locationId}>
                  <span>{site.name}</span>
                  <span className={styles.track} aria-hidden="true">
                    <i style={{ width: `${Math.round((site.jobs / topJobs) * 100)}%` }} />
                  </span>
                  <strong>{site.jobs}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No jobs were raised at your sites in this period.</p>
          )}
        </div>
      </section>
    </div>
  );
}
