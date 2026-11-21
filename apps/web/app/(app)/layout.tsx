import type { ReactNode } from 'react';
import { Icon, Logo, initials } from '@cafm/ui';
import { currentUser } from '@/lib/session';
import { SignOutButton } from './sign-out-button';

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  starter: 'Starter',
  professional: 'Professional',
  enterprise: 'Enterprise',
};

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  return (
    <div className="app">
      <aside className="nav" aria-label="Main">
        <div className="nav-top">
          <div className="brand">
            <Logo size={28} />
            <span>CAFM</span>
          </div>
          <div className="tenant">
            <span className="t-logo">{initials(user.tenant.name)}</span>
            <div className="grow">
              <div className="t-name">{user.tenant.name}</div>
              <div className="t-sub">{PLAN_LABELS[user.tenant.plan] ?? user.tenant.plan}</div>
            </div>
          </div>
        </div>
        <nav className="nav-scroll">
          <div className="nav-sec">
            <a className="nav-item active" href="/app" aria-current="page">
              <Icon name="dashboard" />
              <span>Home</span>
            </a>
          </div>
        </nav>
        <div className="nav-foot">
          <span className="av nav-av">{initials(user.name)}</span>
          <div className="grow">
            <div className="who">{user.name}</div>
            <div className="xs">{user.roleLabel}</div>
          </div>
          <SignOutButton />
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
