'use client';

import { useCallback, useEffect, useState } from 'react';
import type { MobilePackJob } from '@cafm/shared';
import { readJobs, readSync } from '@/lib/mobile-store';
import { syncJobs, type SyncResult } from '@/lib/mobile-sync-client';

/** The jobs held on the phone, shown at once, then refreshed from the server when there is signal. */
export function useJobs() {
  const [jobs, setJobs] = useState<MobilePackJob[] | null>(null);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setJobs(await readJobs());
    setSyncedAt((await readSync())?.syncedAt ?? null);
  }, []);

  const sync = useCallback(async () => {
    setBusy(true);
    const outcome = await syncJobs();
    setResult(outcome);
    if (outcome === 'signed_out') window.location.replace('/login?next=%2Fm');
    await load();
    setBusy(false);
  }, [load]);

  useEffect(() => {
    void load().then(sync);
  }, [load, sync]);

  return { jobs, syncedAt, result, busy, sync };
}

export function syncedText(syncedAt: string | null, result: SyncResult | null): string {
  if (result === 'offline')
    return syncedAt ? 'Offline. Last synced ' + ago(syncedAt) + '.' : 'Offline. Nothing saved yet.';
  if (result === 'unavailable') return 'Could not sync. Try again soon.';
  return syncedAt ? 'Synced ' + ago(syncedAt) + '. Works offline.' : 'Not synced yet.';
}

function ago(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return minutes + ' min ago';
  if (minutes < 1440) return Math.floor(minutes / 60) + 'h ago';
  return Math.floor(minutes / 1440) + 'd ago';
}
