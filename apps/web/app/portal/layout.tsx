import type { ReactNode } from 'react';
import Link from 'next/link';
import { can, feature } from '@fmstead/shared';
import { Logo } from '@fmstead/ui';
import type { CurrentUser } from '@fmstead/shared';
import { apiGet } from '@/lib/api';
import { PortalNotifications } from './portal-notifications';
import styles from '../(app)/app/helpdesk/helpdesk.module.css';

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const response = await apiGet('/auth/me');
  if (!response.ok) return children;
  const user = (await response.json()) as CurrentUser;
  const allowed = feature(user.entitlements, 'helpdesk') && can(user, 'requests.create');
  return (
    <div>
      <header className={styles.portalHeader}>
        <Logo />
        <Link className="medium" href="/portal">
          {user.tenant.name} · Workplace services
        </Link>
        <span className="grow" />
        <nav aria-label="Requester portal" className={styles.actions}>
          <Link href="/portal#my-requests">My requests</Link>
          <Link href="/app">Go to FM Stead</Link>
          {allowed && <PortalNotifications />}
        </nav>
      </header>
      <main>
        {allowed ? (
          children
        ) : (
          <div className={styles.portalContent}>
            <h1 className="page-title">Requester portal</h1>
            <p>Your organisation or role doesn’t include request reporting.</p>
          </div>
        )}
      </main>
    </div>
  );
}
