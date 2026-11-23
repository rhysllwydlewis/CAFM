'use client';

import { usePathname } from 'next/navigation';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Icon } from '@cafm/ui';

const TABS = [
  { href: '/m', label: 'My jobs', icon: 'work-order' },
  { href: '/m/sync', label: 'Sync', icon: 'refresh' },
  { href: '/m/me', label: 'Me', icon: 'user' },
] as const;

/** Who the saved jobs belong to: the membership this page was signed in for. */
const MembershipContext = createContext('');
export const useMembershipId = () => useContext(MembershipContext);

/**
 * Saves each screen and the scripts and styles it needs, so a screen not opened yet still works offline.
 * The pages name their own files, so they are read from the page text.
 */
async function saveForOffline(paths: string[]): Promise<void> {
  const files = new Set<string>();
  for (const path of paths) {
    const page = await fetch(path, { headers: { accept: 'text/html' } });
    const text = await page.text();
    for (const match of text.matchAll(/(?:\/_next\/)?(static\/[^"'\s\\]+?\.(?:js|css))/g)) {
      files.add('/_next/' + match[1]);
    }
  }
  await Promise.all([...files].map((file) => fetch(file)));
}

function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

export function MobileShell({ children, membershipId }: { children: ReactNode; membershipId: string }) {
  const pathname = usePathname();
  const online = useOnline();
  const [offlineReady, setOfflineReady] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/m' })
        .then(() => navigator.serviceWorker.ready)
        // Files are only kept once the worker controls this page, which can be a moment after it is ready.
        .then(async () => {
          if (navigator.serviceWorker.controller) return;
          await new Promise<void>((resolve) =>
            navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }),
          );
        })
        // Keep every screen for offline use, not only the ones visited so far.
        .then(() => saveForOffline(['/m', '/m/job', '/m/job/complete', '/m/sync', '/m/me']))
        .then(() => setOfflineReady(true))
        .catch(() => undefined);
    }
  }, []);

  return (
    <MembershipContext.Provider value={membershipId}>
      <div
        data-offline-ready={offlineReady}
        style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--bg-app)' }}
      >
        {!online && (
          <div className="m-card" role="status" style={{ margin: 12, background: 'var(--warning-soft)' }}>
            <span className="row" style={{ gap: 8 }}>
              <Icon name="offline" size={18} />
              <span className="sm medium">Offline. Showing the jobs saved on this phone.</span>
            </span>
          </div>
        )}
        <main style={{ flex: 1, paddingBottom: 16 }}>{children}</main>
        <nav
          className="m-tabs"
          aria-label="App sections"
          style={{ position: 'sticky', bottom: 0, gridTemplateColumns: 'repeat(' + TABS.length + ', 1fr)' }}
        >
          {TABS.map((tab) => {
            const on = tab.href === '/m' ? pathname === '/m' || pathname.startsWith('/m/job') : pathname === tab.href;
            return (
              <a
                key={tab.href}
                href={tab.href}
                aria-current={on ? 'page' : undefined}
                style={{
                  textDecoration: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 11,
                  fontWeight: 500,
                  color: on ? 'var(--primary)' : 'var(--text-faint)',
                }}
              >
                <Icon name={tab.icon} size={24} />
                {tab.label}
              </a>
            );
          })}
        </nav>
      </div>
    </MembershipContext.Provider>
  );
}
