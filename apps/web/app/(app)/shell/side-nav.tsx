'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, Logo, Wordmark, initials } from '@cafm/ui';
import { t } from '@/lib/i18n';
import { UserMenu } from './user-menu';
import type { ShellNavSection, ShellOrganisation } from './types';

interface Props {
  sections: ShellNavSection[];
  tenantName: string;
  /** The organisation's uploaded logo, if it has one. */
  logoUrl?: string;
  planLabel: string;
  user: { name: string; email: string | null; roleLabel: string };
  organisations: ShellOrganisation[];
  footer: ReactNode;
  open: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

/** What an icon-only menu item is called: its label, and that it is locked when the plan does not include it. */
function navLabel(item: { label: string; locked: boolean }): string {
  return item.locked ? `${item.label} (${t('shell.locked')})` : item.label;
}

/**
 * The side menu. On a phone it is a drawer opened from the top bar (mockup shell-04). On a desktop a button beside
 * the logo collapses it to a slim icon rail and back (mockups shell-05 and shell-06).
 */
export function SideNav({
  sections,
  tenantName,
  logoUrl,
  planLabel,
  user,
  organisations,
  footer,
  open,
  onClose,
  collapsed,
  onToggleCollapsed,
}: Props) {
  const pathname = usePathname();
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    // The collapse button comes first in the page but is hidden on a phone, so ask for the Close button by name.
    ref.current?.querySelector<HTMLElement>('.shell-nav-close')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      {open && <div className="scrim shell-nav-scrim" onClick={onClose} aria-hidden="true" />}
      <aside ref={ref} className={`nav ${open ? 'shell-nav-open' : ''}`} aria-label="Main">
        <div className="nav-top">
          <div className="row between">
            <div className="brand">
              {/* The name when the menu is open, and the tile mark when it is collapsed to a rail. */}
              <Logo size={28} className="brand-mark" />
              <Wordmark height={22} tone="inverse" className="brand-word" />
            </div>
            <button
              type="button"
              className="nav-toggle"
              aria-label={collapsed ? t('shell.expandNav') : t('shell.collapseNav')}
              title={collapsed ? t('shell.expandNav') : t('shell.collapseNav')}
              onClick={onToggleCollapsed}
            >
              <Icon name={collapsed ? 'panel-left-open' : 'panel-left-close'} />
            </button>
            <button type="button" className="btn ghost sm shell-nav-close" onClick={onClose}>
              {t('shell.closeMenu')}
            </button>
          </div>
          <div className="tenant">
            {logoUrl ? (
              <span className="t-logo t-logo-image">
                <img src={logoUrl} alt="" />
              </span>
            ) : (
              <span className="t-logo">{initials(tenantName)}</span>
            )}
            <div className="grow">
              <div className="t-name">{tenantName}</div>
              <div className="t-sub">{planLabel}</div>
            </div>
          </div>
        </div>
        <nav className="nav-scroll" aria-label="Modules">
          {sections.map((section) => (
            <div className="nav-sec" key={section.label || 'main'}>
              {section.label && <div className="nav-label">{section.label}</div>}
              {section.items.map((item) => {
                const active = item.href === '/app' ? pathname === '/app' : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.key}
                    className={`nav-item ${active ? 'active' : ''}`}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    // The tooltip is generated text, and generated text counts towards a link's name, so name it outright:
                    // otherwise a screen reader says "Helpdesk Helpdesk" while the tooltip shows.
                    aria-label={collapsed ? navLabel(item) : undefined}
                    data-label={collapsed ? navLabel(item) : undefined}
                  >
                    <Icon name={item.icon} />
                    <span>{item.label}</span>
                    {item.locked && (
                      <span className="nav-lock" title={t('shell.locked')}>
                        <Icon name="locked" size={14} label={t('shell.locked')} />
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="nav-foot">
          <UserMenu user={user} organisations={organisations} />
          {footer}
        </div>
      </aside>
    </>
  );
}
