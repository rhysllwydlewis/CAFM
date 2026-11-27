'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Icon } from '@fmstead/ui';
import { t } from '@/lib/i18n';
import { CommandPalette } from './command-palette';
import { DemoResetBanner } from './demo-banner';
import { ImpersonationBanner } from './impersonation-banner';
import { saveNavCollapsed } from './nav-state';
import { NotificationsDrawer } from './notifications';
import { SideNav } from './side-nav';
import type { ShellNavSection, ShellOrganisation } from './types';

interface Props {
  sections: ShellNavSection[];
  tenantName: string;
  logoUrl?: string;
  planLabel: string;
  demo: boolean;
  /** The account keeps no display choices (a shared demo persona), so they last only until the page is reloaded. */
  preferencesLocked: boolean;
  user: { name: string; email: string | null; roleLabel: string };
  organisations: ShellOrganisation[];
  impersonation: { by: string; expiresAt: string } | null;
  footer: ReactNode;
  initialNavCollapsed?: boolean;
  children: ReactNode;
}

/** The authenticated app's frame (mockups home-01, home-03, home-04, shell-01 to shell-04). */
export function AppShell({
  sections,
  tenantName,
  logoUrl,
  planLabel,
  demo,
  preferencesLocked,
  user,
  organisations,
  impersonation,
  footer,
  initialNavCollapsed = false,
  children,
}: Props) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(initialNavCollapsed);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const items = sections.flatMap((s) => s.items);
  const current = items.find((i) => (i.href === '/app' ? pathname === '/app' : pathname.startsWith(i.href)));

  // Close the phone menu when the page changes.
  useEffect(() => setNavOpen(false), [pathname]);

  const viewingAs = impersonation !== null;
  const toggleNav = useCallback(() => {
    setNavCollapsed(!navCollapsed);
    // "View as" is read-only and would save on the other person's account, and the demo's shared people save no choices
    // (visitors would hand them on to each other). Either way it lasts only until the page is reloaded. A real person
    // in a demo organisation is neither, so they save as usual: this follows the account, not the organisation.
    if (!viewingAs && !preferencesLocked) saveNavCollapsed(!navCollapsed);
  }, [navCollapsed, viewingAs, preferencesLocked]);

  const onKey = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      setPaletteOpen((o) => !o);
    }
  }, []);
  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  return (
    <div className={`app ${navCollapsed ? 'nav-collapsed' : ''}`}>
      <SideNav
        sections={sections}
        tenantName={tenantName}
        logoUrl={logoUrl}
        planLabel={planLabel}
        user={user}
        organisations={organisations}
        footer={footer}
        open={navOpen}
        onClose={() => setNavOpen(false)}
        collapsed={navCollapsed}
        onToggleCollapsed={toggleNav}
      />
      <main className="main">
        {impersonation && <ImpersonationBanner viewing={user.name} {...impersonation} />}
        {demo && <DemoResetBanner />}
        <header className="topbar">
          <button
            type="button"
            className="tb-icon shell-menu-button"
            aria-label={t('shell.menu')}
            aria-expanded={navOpen}
            onClick={() => setNavOpen(true)}
          >
            <Icon name="more" size={18} />
          </button>
          <div className="crumbs">
            <span>{tenantName}</span>
            <Icon name="chevron-right" />
            <b>{current?.label ?? 'Home'}</b>
          </div>
          <button type="button" className="gsearch" onClick={() => setPaletteOpen(true)}>
            <Icon name="search" size={14} />
            <span>{t('shell.search')}</span>
            <span className="kbd">{t('shell.searchShortcut')}</span>
          </button>
          <button
            type="button"
            className="tb-icon"
            aria-label={t('shell.notifications')}
            aria-expanded={notificationsOpen}
            onClick={() => setNotificationsOpen(true)}
          >
            <Icon name="notifications" size={18} />
          </button>
        </header>
        {children}
      </main>
      {paletteOpen && <CommandPalette items={items} onClose={() => setPaletteOpen(false)} />}
      {notificationsOpen && <NotificationsDrawer onClose={() => setNotificationsOpen(false)} />}
    </div>
  );
}
