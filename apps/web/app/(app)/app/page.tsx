import type { Metadata } from 'next';
import Link from 'next/link';
import { can, feature, formatMinor } from '@fmstead/shared';
import { Icon } from '@fmstead/ui';
import { currentUser } from '@/lib/session';
import styles from './home.module.css';
import { homeSummary, ppmCompliance, slaPerformance } from '@/lib/reports';

export const metadata: Metadata = { title: 'Home' };

const LONDON = 'Europe/London';

interface Tile {
  label: string;
  value: string;
  note: string;
  href: string;
}

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
  // The default dashboard: fixed tiles that suit the role. Each block of the summary is present only when the role
  // and plan allow it (own jobs for a technician or contractor, the queue for the helpdesk, spend for finance).
  const summary = await homeSummary();
  const reports = feature(user.entitlements, 'reports') && can(user, 'reports.read');
  const [sla, ppm] = reports ? await Promise.all([slaPerformance({}), ppmCompliance({})]) : [];
  const jobs = summary.jobs;
  const tiles: Tile[] = [
    ...(jobs
      ? [
          {
            label: jobs.own ? 'Your open jobs' : 'Open work orders',
            value: String(jobs.open),
            note: `${jobs.overdue} overdue, ${jobs.dueToday} due today`,
            href: '/app/work-orders',
          },
          ...(jobs.own
            ? []
            : [
                {
                  label: 'Unassigned jobs',
                  value: String(jobs.unassigned),
                  note: 'Open, with nobody to do them',
                  href: '/app/work-orders',
                },
              ]),
        ]
      : []),
    ...(summary.requests
      ? [
          {
            label: 'New requests',
            value: String(summary.requests.new),
            note: `${summary.requests.responseOverdue} past their response target`,
            href: '/app/helpdesk',
          },
        ]
      : []),
    ...(summary.spend
      ? [
          {
            label: 'Cost, last 30 days',
            value: summary.spend.totals.length
              ? summary.spend.totals.map((t) => formatMinor(t.amountMinor, t.currency)).join(' · ')
              : formatMinor(0),
            note: `${summary.spend.overLimitJobs} jobs over their limit`,
            href: '/app/work-orders',
          },
        ]
      : []),
    ...(sla && ppm
      ? [
          {
            label: 'SLA met, last 30 days',
            value: sla.percentMet === null ? '—' : sla.percentMet + '%',
            note: `${sla.met} of ${sla.measured} jobs`,
            href: '/app/reports',
          },
          {
            label: 'PPM on time, last 30 days',
            value: ppm.percentOnTime === null ? '—' : ppm.percentOnTime + '%',
            note: `${ppm.overdue} overdue`,
            href: '/app/reports',
          },
        ]
      : []),
  ];
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
              <Link href={tile.href} className="card card-b stack g2" key={tile.label}>
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
