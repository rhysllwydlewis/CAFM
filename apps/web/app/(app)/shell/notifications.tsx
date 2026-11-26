'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import Link from 'next/link';
import { Button, Icon } from '@fmstead/ui';
import type { NotificationItem } from '@fmstead/shared';
import { helpdeskWrite } from '@/lib/helpdesk-client';
import { t } from '@/lib/i18n';

type Inbox = { items: NotificationItem[]; unread: number; pushKey: string | null };
const time = new Intl.DateTimeFormat('en-GB', { dateStyle: 'short', timeStyle: 'short' });

function applicationKey(value: string) {
  const standard = value.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(standard.padEnd(Math.ceil(standard.length / 4) * 4, '=')), (char) => char.charCodeAt(0));
}

/** The live inbox uses the same drawer and focus behaviour as the shell mockup. */
export function NotificationsDrawer({ onClose }: { onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  const [inbox, setInbox] = useState<Inbox>();
  const [error, setError] = useState('');
  const [push, setPush] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch('/api/notifications', { signal });
      if (response.status === 403) {
        if (!signal?.aborted) setInbox({ items: [], unread: 0, pushKey: null });
        return;
      }
      if (!response.ok) throw new Error();
      const data = (await response.json()) as Inbox;
      if (!signal?.aborted) setInbox(data);
      if (data.pushKey && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) {
        const registration = await navigator.serviceWorker.getRegistration('/notification-push.js');
        const subscription = await registration?.pushManager.getSubscription();
        const status = subscription
          ? await helpdeskWrite<{ subscribed: boolean }>('/notifications/push/status', {
              endpoint: subscription.endpoint,
            })
          : null;
        if (!signal?.aborted) setPush(status?.subscribed ?? false);
      }
    } catch {
      if (!signal?.aborted) setError('Could not load notifications.');
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [onClose]);

  async function mark(id?: string) {
    try {
      await helpdeskWrite(id ? '/notifications/' + id + '/read' : '/notifications/read-all', {}, 'PATCH');
      await load();
    } catch {
      setError('Could not mark notifications as read.');
    }
  }

  async function togglePush() {
    if (!inbox?.pushKey) return;
    setError('');
    setSaving(true);
    try {
      // Permission prompts must run within the button's user gesture.
      if (!push && (await Notification.requestPermission()) !== 'granted') {
        setError('Your browser blocked notifications. You can allow them in site settings.');
        return;
      }
      await navigator.serviceWorker.register('/notification-push.js');
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (push && existing) {
        // The shared browser endpoint can be used by other opted-in memberships.
        await helpdeskWrite('/notifications/push', { endpoint: existing.endpoint }, 'DELETE');
        setPush(false);
      } else {
        const subscription =
          existing ??
          (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationKey(inbox.pushKey),
          }));
        try {
          const { endpoint, keys } = subscription.toJSON();
          await helpdeskWrite('/notifications/push', { endpoint, keys });
          setPush(true);
        } catch (error) {
          if (!existing) await subscription.unsubscribe();
          throw error;
        }
      }
    } catch {
      setError('Could not update browser notifications.');
    } finally {
      setSaving(false);
    }
  }

  function keepFocusInDrawer(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== 'Tab') return;
    const focusable = event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]');
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const next =
      event.shiftKey && document.activeElement === first
        ? last
        : !event.shiftKey && document.activeElement === last
          ? first
          : null;
    if (next) {
      event.preventDefault();
      next.focus();
    }
  }

  return (
    <>
      <div className="scrim shell-scrim-light" onClick={onClose} aria-hidden="true" />
      <aside
        className="drawer shell-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notifications-title"
        onKeyDown={keepFocusInDrawer}
      >
        <div className="row shell-drawer-head">
          <h2 className="card-t" id="notifications-title">
            {t('shell.notifications')}
          </h2>
          <span className="grow" />
          <button ref={close} type="button" className="btn ghost sm" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="card-b stack g3">
          {inbox &&
            (inbox.unread > 0 ||
              (inbox.pushKey &&
                'serviceWorker' in navigator &&
                'PushManager' in window &&
                'Notification' in window)) && (
              <div className="row wrap g2">
                {inbox.unread > 0 && (
                  <Button size="sm" onClick={() => void mark()}>
                    Mark all as read
                  </Button>
                )}
                {inbox.pushKey &&
                  'serviceWorker' in navigator &&
                  'PushManager' in window &&
                  'Notification' in window && (
                    <Button size="sm" disabled={saving} onClick={() => void togglePush()}>
                      {push ? 'Turn off browser notifications' : 'Enable browser notifications'}
                    </Button>
                  )}
              </div>
            )}
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          {!inbox && !error && <p role="status">Loading notifications…</p>}
          {inbox?.items.length === 0 && (
            <div className="empty">
              <Icon name="notifications" size={24} />
              <p>{t('shell.notificationsEmpty')}</p>
            </div>
          )}
          {inbox?.items.map((item) => (
            <article key={item.id} className="card card-b stack g2">
              <div className="row wrap between g2">
                <strong>{item.title}</strong>
                {!item.readAt && <span className="badge primary">Unread</span>}
              </div>
              <p>{item.body}</p>
              <time dateTime={item.createdAt} className="sm muted">
                {time.format(new Date(item.createdAt))}
              </time>
              <div className="row wrap g2">
                {item.requestId && (
                  <Link href={'/portal/requests/' + item.requestId} onClick={onClose}>
                    Open request
                  </Link>
                )}
                {item.workOrderId && (
                  <Link href={'/app/work-orders/' + item.workOrderId} onClick={onClose}>
                    Open work order
                  </Link>
                )}
                {item.assetId && (
                  <Link href={'/app/assets/' + item.assetId + '/operations#warranties'} onClick={onClose}>
                    Open asset warranties
                  </Link>
                )}
                {!item.readAt && (
                  <Button size="sm" onClick={() => void mark(item.id)}>
                    Mark as read
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
      </aside>
    </>
  );
}
