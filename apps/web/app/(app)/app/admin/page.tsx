import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { can, type AdminOverview } from '@cafm/shared';
import { Icon } from '@cafm/ui';
import { currentUser } from '@/lib/session';
import { readAdmin } from '@/lib/admin';
import styles from './admin.module.css';

export const metadata: Metadata = { title: 'Administration' };

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card">
      <div className="kpi">
        <span className="kpi-l">{label}</span>
        <span className="kpi-v num">{value}</span>
        <span className="kpi-d">{sub}</span>
      </div>
    </div>
  );
}

const LICENCE_LABELS: Record<string, string> = {
  full: 'full',
  mobile: 'mobile',
  contractor: 'contractor',
  requester: 'requester',
  client: 'client',
  read_only: 'read-only',
};

export default async function AdminOverviewPage() {
  const user = await currentUser();
  if (!can(user, 'settings.manage')) redirect(can(user, 'people.manage') ? '/app/admin/users' : '/app');
  const o = await readAdmin<AdminOverview>('/admin/overview');
  const mix = Object.entries(o.licences)
    .map(([key, n]) => `${n} ${LICENCE_LABELS[key] ?? key}`)
    .join(' · ');
  const seats = o.fullSeats.limit === null ? `${o.fullSeats.used}` : `${o.fullSeats.used} / ${o.fullSeats.limit}`;
  const done = o.checklist.filter((item) => item.done).length;
  return (
    <>
      <div className={styles.metrics}>
        <Tile label="Active users" value={String(o.activeUsers)} sub={mix || 'No one yet'} />
        <Tile
          label="Full user seats"
          value={seats}
          sub={o.pendingInvites ? `Includes pending invites (${o.pendingInvites} open)` : 'Active and invited'}
        />
        <Tile
          label="Changes (7 days)"
          value={String(o.changesLast7Days.count)}
          sub={`by ${o.changesLast7Days.people} ${o.changesLast7Days.people === 1 ? 'person' : 'people'}`}
        />
        <Tile label="Super Users" value={String(o.superUsers)} sub={o.plan + ' plan'} />
      </div>
      <section className="card" aria-labelledby="setup-title">
        <div className="card-h">
          <h2 className="card-t" id="setup-title">
            Setup checklist ({done} of {o.checklist.length})
          </h2>
        </div>
        <div className="card-b">
          <ul className={styles.checklist}>
            {o.checklist.map((item) => (
              <li key={item.key} className="row g2">
                <Icon name={item.done ? 'approve' : 'clock'} size={18} />
                <Link href={item.href}>{item.label}</Link>
                <span className="faint sm">{item.done ? 'Done' : 'To do'}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
