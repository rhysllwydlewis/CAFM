'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Icon } from '@cafm/ui';
import { t } from '@/lib/i18n';
import { CommandPalette } from './command-palette';
import { DemoResetBanner } from './demo-banner';
import { NotificationsDrawer } from './notifications';
import { SideNav } from './side-nav';
import type { ShellNavSection, ShellOrganisation } from './types';

interface Props {
  sections: ShellNavSection[];
  tenantName: string;
  planLabel: string;
  demo: boolean;
  user: { name: string; email: string | null; roleLabel: string };
  organisations: ShellOrganisation[];
  footer: ReactNode;
  children: ReactNode;
}

/** The authenticated app's frame (mockups home-01, home-03, home-04, shell-01 to shell-04). */
export function AppShell({ sections, tenantName, planLabel, demo, user, organisations, footer, children }: Props) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const items = sections.flatMap((s) => s.items);
  const current = items.find((i) => (i.href === '/app' ? pathname === '/app' : pathname.startsWith(i.href)));

  // Close the phone menu when the page changes.
  useEffect(() => setNavOpen(false), [pathname]);

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
    <div className="app">
      <SideNav
        sections={sections}
        tenantName={tenantName}
        planLabel={planLabel}
        user={user}
        organisations={organisations}
        footer={footer}
        open={navOpen}
        onClose={() => setNavOpen(false)}
      />
      <main className="main">
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
