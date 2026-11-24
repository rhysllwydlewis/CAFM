import type { Metadata } from 'next';
import Link from 'next/link';
import { can, feature } from '@cafm/shared';
import { Icon } from '@cafm/ui';
import { currentUser } from '@/lib/session';
import styles from './home.module.css';
import { openJobsByAge, ppmCompliance, slaPerformance } from '@/lib/reports';

export const metadata: Metadata = { title: 'Home' };

const LONDON = 'Europe/London';

function greeting(now: Date): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: LONDON }).format(now),
  );
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

export default async function HomePage() {
  const user = await currentUser();
  const now = new Date();
  const today = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: LONDON,
  }).format(now);
  // The default dashboard: fixed tiles for anyone whose role can read reports. Each tile links to its report.
  const tiles =
    feature(user.entitlements, 'reports') && can(user, 'reports.read')
      ? await Promise.all([openJobsByAge(), slaPerformance({}), ppmCompliance({})]).then(([age, sla, ppm]) => [
          {
            label: 'Open work orders',
            value: String(age.total),
            note: `${age.bands[3]?.count ?? 0} open over 30 days`,
          },
          {
            label: 'SLA met, last 30 days',
            value: sla.percentMet === null ? '—' : sla.percentMet + '%',
            note: `${sla.met} of ${sla.measured} jobs`,
          },
          {
            label: 'PPM on time, last 30 days',
            value: ppm.percentOnTime === null ? '—' : ppm.percentOnTime + '%',
            note: `${ppm.overdue} overdue`,
          },
        ])
      : [];
  const firstName = user.name.split(' ')[0];
  return (
    <>
      <div className="page">
        <div className="page-head">
          <div>
            <h1 className="page-title">
              {greeting(now)}, {firstName}
            </h1>
            <div className="page-sub">{today}</div>
          </div>
        </div>
        {tiles.length > 0 && (
          <section aria-label="Key figures" className={styles.tiles}>
            {tiles.map((tile) => (
              <Link href="/app/reports" className="card card-b stack g2" key={tile.label}>
                <span className="sm muted">{tile.label}</span>
                <strong className="page-title">{tile.value}</strong>
                <span className="sm muted">{tile.note}</span>
              </Link>
            ))}
          </section>
        )}
        <div className="callout">
          <Icon name="info" />
          <div className="grow">
            You&apos;re signed in to <b>{user.tenant.name}</b> as {user.roleLabel}. The menu shows every module your
            role can use; each one fills in as it&apos;s built. Press <span className="kbd">Ctrl K</span> to jump to any
            page.
          </div>
        </div>
      </div>
    </>
  );
}
