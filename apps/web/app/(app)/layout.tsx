import type { ReactNode } from 'react';
import { can, feature, PLAN_LABELS, type OrganisationOption, type Plan } from '@cafm/shared';
import { apiGet } from '@/lib/api';
import { NAV } from '@/lib/nav';
import { currentUser } from '@/lib/session';
import { AppShell } from './shell/app-shell';
import type { ShellNavSection } from './shell/types';
import { SignOutButton } from './sign-out-button';

async function organisations(): Promise<OrganisationOption[]> {
  const res = await apiGet('/auth/organisations');
  return res.ok ? ((await res.json()) as OrganisationOption[]) : [];
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  const orgs = await organisations();

  // Menu items the member's role allows (can()); locked if the plan doesn't include them (feature()).
  const sections: ShellNavSection[] = NAV.map((section) => ({
    label: section.label,
    items: section.items
      .filter((item) => !item.permission || can(user, item.permission))
      .map((item) => ({
        key: item.key,
        label: item.label,
        icon: item.icon,
        href: item.href,
        locked: !!item.feature && !feature(user.entitlements, item.feature),
      })),
  })).filter((s) => s.items.length > 0);

  return (
    <AppShell
      sections={sections}
      tenantName={user.tenant.name}
      planLabel={PLAN_LABELS[user.tenant.plan as Plan] ?? user.tenant.plan}
      demo={user.tenant.demo}
      user={{ name: user.name, email: user.email, roleLabel: user.roleLabel }}
      organisations={orgs.map((o) => ({ ...o, current: o.membershipId === user.membershipId }))}
      footer={<SignOutButton />}
    >
      {children}
    </AppShell>
  );
}
