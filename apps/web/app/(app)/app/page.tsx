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
            You&apos;re signed in to <b>{user.tenant.name}</b> as {user.roleLabel}. The menu shows every module your
            role can use; each one fills in as it&apos;s built. Press <span className="kbd">Ctrl K</span> to jump to any
            page.
          </div>
        </div>
      </div>
    </>
  );
}
