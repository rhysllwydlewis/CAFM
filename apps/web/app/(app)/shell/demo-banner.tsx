'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@cafm/ui';
import { t } from '@/lib/i18n';

/** Minutes until the next 03:00 in London, when the demo resets (doc 06). */
export function minutesToReset(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')!.value);
  const minute = Number(parts.find((p) => p.type === 'minute')!.value);
  const sinceMidnight = hour * 60 + minute;
  const reset = 3 * 60;
  return (reset - sinceMidnight + 24 * 60) % (24 * 60);
}

/** Warns signed-in demo users in the 10 minutes before the nightly reset. */
export function DemoResetBanner() {
  const [minutes, setMinutes] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setMinutes(minutesToReset(new Date()));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  if (minutes === null || minutes === 0 || minutes > 10) return null;
  return (
    <div className="callout warning shell-banner" role="status">
      <Icon name="clock" />
      <div className="grow">{t('demo.resetSoon', { minutes })}</div>
    </div>
  );
}
