import type { Metadata } from 'next';
import Link from 'next/link';
import { can, feature } from '@cafm/shared';
import { Icon } from '@cafm/ui';
import { currentUser } from '@/lib/session';
import { requestPage } from '@/lib/helpdesk';
import { StartRequest } from './start-request';
import { RequestTable } from '../(app)/app/helpdesk/request-table';
import styles from '../(app)/app/helpdesk/helpdesk.module.css';

export const metadata: Metadata = { title: 'Requester portal' };

export default async function PortalPage({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  const user = await currentUser('/portal');
  if (!can(user, 'requests.create') || !feature(user.entitlements, 'helpdesk')) return null;
  const input = await searchParams;
  const cursor = typeof input.cursor === 'string' && /^[a-f0-9-]{36}$/i.test(input.cursor) ? input.cursor : undefined;
  const query = cursor ? '?cursor=' + encodeURIComponent(cursor) : '';
  const { items, nextCursor } = await requestPage('mine', query);
  return (
    <>
      <section className={styles.portalHero}>
        <h1 className="page-title">Hi {user.name.split(' ')[0]}, how can we help?</h1>
        <StartRequest />
      </section>
      <div className={styles.portalContent}>
        <div className={styles.columns + ' ' + styles.portalCards}>
          <Link href="/portal/new" className="card card-b stack g2">
            <Icon name="reactive" size={24} />
            <strong>Report a fault</strong>
            <span className="muted">Something broken or not working</span>
          </Link>
          <Link href="/portal/new" className="card card-b stack g2">
            <Icon name="soft-services" size={24} />
            <strong>Request a service</strong>
            <span className="muted">Cleaning, moves or other services</span>
          </Link>
        </div>
        <section id="my-requests" className="card card-b stack g3">
          <h2 className="card-t">My requests</h2>
          <RequestTable items={items} now={0} own />
          {(cursor || nextCursor) && (
            <div className={styles.actions}>
              {cursor && (
                <Link href="/portal#my-requests" className="btn">
                  First page
                </Link>
              )}
              {nextCursor && (
                <Link className="btn" href={'/portal?cursor=' + nextCursor + '#my-requests'}>
                  Next page
                </Link>
              )}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
