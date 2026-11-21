import type { Metadata } from 'next';
import { Icon } from '@cafm/ui';
import { currentUser } from '@/lib/session';

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
  const firstName = user.name.split(' ')[0];
  return (
    <>
      <header className="topbar">
        <div className="crumbs">
          <span>{user.tenant.name}</span>
          <Icon name="chevron-right" />
          <b>Home</b>
        </div>
      </header>
      <div className="page">
        <div className="page-head">
          <div>
            <h1 className="page-title">
              {greeting(now)}, {firstName}
            </h1>
            <div className="page-sub">{today}</div>
          </div>
        </div>
        <div className="callout">
          <Icon name="info" />
          <div className="grow">
            You&apos;re signed in to <b>{user.tenant.name}</b> as {user.roleLabel}. The helpdesk, work orders, assets
            and the rest of the modules are added here as they&apos;re built.
          </div>
        </div>
      </div>
    </>
  );
}
