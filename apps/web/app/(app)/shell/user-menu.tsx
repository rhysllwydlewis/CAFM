'use client';

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Icon, initials } from '@cafm/ui';
import { PLAN_LABELS, type Plan } from '@cafm/shared';
import { postJson } from '@/lib/client';
import { t } from '@/lib/i18n';
import { applyTheme, readTheme, type ThemeChoice } from '@/lib/theme';
import type { ShellOrganisation } from './types';

const THEME_OPTIONS = [
  ['light', t('shell.themeLight'), 'theme-light'],
  ['dark', t('shell.themeDark'), 'theme-dark'],
  ['system', t('shell.themeSystem'), 'settings'],
] as const;

/** The name at the foot of the side menu opens this (mockup shell-01): organisation and theme. */
export function UserMenu({
  user,
  organisations,
}: {
  user: { name: string; email: string | null; roleLabel: string };
  organisations: ShellOrganisation[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeChoice>('system');
  const [switching, setSwitching] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => setTheme(readTheme()), []);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !root.current?.contains(e.target as Node)) {
        setOpen(false);
        if (e instanceof KeyboardEvent) trigger.current?.focus();
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  function chooseTheme(choice: ThemeChoice) {
    setTheme(choice);
    applyTheme(choice);
  }

  // A radio group is one tab stop, and the arrow keys move the choice (and the focus) around it.
  function onThemeKey(e: ReactKeyboardEvent<HTMLDivElement>) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next =
      THEME_OPTIONS[
        (THEME_OPTIONS.findIndex(([value]) => value === theme) + step + THEME_OPTIONS.length) % THEME_OPTIONS.length
      ]![0];
    chooseTheme(next);
    e.currentTarget.querySelector<HTMLElement>(`[data-theme-value="${next}"]`)?.focus();
  }

  async function switchTo(membershipId: string) {
    setSwitching(membershipId);
    const res = await postJson('/auth/select-organisation', { membershipId });
    if (res.ok) {
      setOpen(false);
      router.push('/app');
      router.refresh();
    }
    setSwitching(null);
  }

  return (
    <div ref={root} className="user-menu grow">
      <button
        ref={trigger}
        type="button"
        className="user-menu-trigger"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {/* Spoken name starts with the purpose but still contains the visible text (WCAG 2.5.3). */}
        <span className="sr-only">{t('shell.userMenu')} </span>
        <span className="av nav-av" aria-hidden="true">
          {initials(user.name)}
        </span>
        <span className="grow">
          <span className="who">{user.name}</span>
          <span className="xs">{user.roleLabel}</span>
        </span>
      </button>
      {open && (
        <div className="popover user-menu-panel">
          <div className="row user-menu-head">
            <span className="av s36">{initials(user.name)}</span>
            <div className="grow">
              <div className="medium">{user.name}</div>
              {user.email && <div className="xs faint">{user.email}</div>}
            </div>
          </div>
          {organisations.length > 1 && (
            <div className="user-menu-section" role="group" aria-label={t('shell.organisation')}>
              <div className="xs faint medium user-menu-label">{t('shell.organisation')}</div>
              {organisations.map((o) => (
                <button
                  key={o.membershipId}
                  type="button"
                  className={`menu-i user-menu-item ${o.current ? 'on' : ''}`}
                  aria-current={o.current ? 'true' : undefined}
                  disabled={o.current || switching !== null}
                  onClick={() => switchTo(o.membershipId)}
                >
                  <span className="av co s20">{initials(o.tenantName)}</span>
                  <span className="grow">{o.tenantName}</span>
                  {o.current ? (
                    <Icon name="success" size={14} label="Current" />
                  ) : (
                    <span className="xs faint">{PLAN_LABELS[o.plan as Plan] ?? o.plan}</span>
                  )}
                </button>
              ))}
            </div>
          )}
          <div className="user-menu-section">
            <div className="xs faint medium user-menu-label" id="theme-label">
              {t('shell.theme')}
            </div>
            <div className="seg" role="radiogroup" aria-labelledby="theme-label" onKeyDown={onThemeKey}>
              {THEME_OPTIONS.map(([value, label, icon]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={theme === value}
                  tabIndex={theme === value ? 0 : -1}
                  data-theme-value={value}
                  className={theme === value ? 'on' : ''}
                  onClick={() => chooseTheme(value)}
                >
                  <Icon name={icon} size={14} />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
