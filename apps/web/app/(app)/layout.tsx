import { redirect } from 'next/navigation';
import type { CSSProperties, ReactNode } from 'react';
import {
  applyDisplay,
  can,
  feature,
  PLAN_LABELS,
  type BrandingView,
  type DisplaySettings,
  type OrganisationOption,
  type Plan,
} from '@fmstead/shared';
import { apiGet } from '@/lib/api';
import { NAV } from '@/lib/nav';
import { currentUser } from '@/lib/session';
import { AppShell } from './shell/app-shell';
import type { ShellNavSection } from './shell/types';
import { SignOutButton } from './sign-out-button';
import { exportable, importable } from './app/admin/import/kinds';

async function organisations(): Promise<OrganisationOption[]> {
  const res = await apiGet('/auth/organisations');
  return res.ok ? ((await res.json()) as OrganisationOption[]) : [];
}

async function displaySettings(): Promise<DisplaySettings | undefined> {
  const res = await apiGet('/display');
  return res.ok ? ((await res.json()) as DisplaySettings) : undefined;
}

async function brandingSettings(): Promise<BrandingView | undefined> {
  const res = await apiGet('/branding');
  return res.ok ? ((await res.json()) as BrandingView) : undefined;
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  // The organisation requires two-step verification and this person hasn't set it up: nothing else is open.
  if (user.mfaSetupRequired) redirect('/mfa-setup');
  const [orgs, display, branding] = await Promise.all([organisations(), displaySettings(), brandingSettings()]);
  // The accent only applies on plans that include branding, and only colours that passed the contrast check.
  const accent =
    branding?.accentColour && feature(user.entitlements, 'custom_domain') ? branding.accentColour : undefined;

  // The organisation and logo version are in the address so a replaced logo, or another organisation's, is fetched again.
  const logoUrl =
    branding?.hasLogo && feature(user.entitlements, 'custom_domain')
      ? `/api/branding/logo?t=${encodeURIComponent(user.tenant.id)}&v=${branding.logoVersion ?? 0}`
      : undefined;

  // Menu items the member's role allows (can()); locked if the plan doesn't include them (feature()).
  const sections: ShellNavSection[] = NAV.map((section) => ({
    label: section.label,
    // The organisation's choices come last: modules switched off, its own names and its own order.
    items: applyDisplay(
      section.items
        .filter((item) => !item.permission || can(user, item.permission))
        .map((item) => ({
          key: item.key,
          label: item.label,
          icon: item.icon,
          href: item.href,
          locked: !!item.feature && !feature(user.entitlements, item.feature),
        })),
      display,
    ),
  })).filter((s) => s.items.length > 0);

  // Import and export is open to anyone who can import or export a kind of data. That includes people with no
  // Administration item (a Planner, for example), who would otherwise have no way to find the screen (issue #104).
  if (importable(user).length + exportable(user).length > 0) {
    const entry = {
      key: 'import-export',
      label: 'Import and export',
      icon: 'export',
      href: '/app/admin/import',
      locked: false,
    };
    const more = sections.find((s) => s.label === 'More');
    if (more) more.items.push(entry);
    else sections.push({ label: 'More', items: [entry] });
  }

  return (
    <div
      style={
        accent
          ? ({
              display: 'contents',
              '--primary': accent,
              '--primary-hover': `color-mix(in srgb, ${accent} 85%, black)`,
            } as CSSProperties)
          : { display: 'contents' }
      }
    >
      <AppShell
        sections={sections}
        tenantName={user.tenant.name}
        logoUrl={logoUrl}
        planLabel={PLAN_LABELS[user.tenant.plan as Plan] ?? user.tenant.plan}
        demo={user.tenant.demo}
        preferencesLocked={user.preferencesLocked}
        user={{ name: user.name, email: user.email, roleLabel: user.roleLabel }}
        impersonation={user.impersonation}
        organisations={orgs.map((o) => ({ ...o, current: o.membershipId === user.membershipId }))}
        footer={<SignOutButton />}
        initialNavCollapsed={user.preferences.navCollapsed === true}
      >
        {children}
      </AppShell>
    </div>
  );
}
