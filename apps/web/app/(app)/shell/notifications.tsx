'use client';

import { useEffect, useRef } from 'react';
import { Icon } from '@cafm/ui';
import { t } from '@/lib/i18n';

/** The notifications drawer (mockup home-04-notifications). Empty until notifications exist (A15). */
export function NotificationsDrawer({ onClose }: { onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [onClose]);
  return (
    <>
      <div className="scrim shell-scrim-light" onClick={onClose} aria-hidden="true" />
      <aside className="drawer shell-drawer" role="dialog" aria-modal="true" aria-labelledby="notifications-title">
        <div className="row shell-drawer-head">
          <h2 className="card-t" id="notifications-title">
            {t('shell.notifications')}
          </h2>
          <span className="grow" />
          <button ref={close} type="button" className="btn ghost sm" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="empty">
          <Icon name="notifications" size={24} />
          <p>{t('shell.notificationsEmpty')}</p>
        </div>
      </aside>
    </>
  );
}
