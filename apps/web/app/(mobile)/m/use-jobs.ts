'use client';

import { useCallback, useEffect, useState } from 'react';
import type { MobilePackJob } from '@cafm/shared';
import { clearIfNotOwner, clearStore, readJobs, readSync } from '@/lib/mobile-store';
import { useMembershipId } from './mobile-shell';
import { flushOutbox, syncJobs, type SyncResult } from '@/lib/mobile-sync-client';

/** The jobs held on the phone, shown at once, then refreshed from the server when there is signal. */
export function useJobs() {
  const [jobs, setJobs] = useState<MobilePackJob[] | null>(null);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [busy, setBusy] = useState(false);
  const owner = useMembershipId();

  const load = useCallback(async () => {
    // Jobs saved for someone else on this browser are removed before anything is shown.
    await clearIfNotOwner(owner);
    setJobs(await readJobs());
    setSyncedAt((await readSync())?.syncedAt ?? null);
  }, [owner]);

  const sync = useCallback(async () => {
    setBusy(true);
    // What was done offline goes first, so the jobs fetched afterwards already include it.
    const flushed = await flushOutbox();
    const outcome = flushed.stopped === 'signed_out' ? 'signed_out' : await syncJobs(owner);
    setResult(outcome);
    if (outcome === 'signed_out') {
      // The session has ended: don't leave this person's jobs on the phone for whoever signs in next.
      await clearStore().catch(() => undefined);
      window.location.replace('/login?next=%2Fm');
      return;
    }
    await load();
    setBusy(false);
  }, [load, owner]);

  useEffect(() => {
    void load().then(sync);
  }, [load, sync]);

  // Signal came back: send what is waiting without the person having to ask.
  useEffect(() => {
    const onOnline = () => void sync();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [sync]);

  return { jobs, syncedAt, result, busy, sync, reload: load };
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
