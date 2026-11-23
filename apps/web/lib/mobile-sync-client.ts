import { applyMobileChanges, type MobileChanges, type MobileWorkPack } from '@cafm/shared';
import { readJobs, readSync, writePack } from './mobile-store';

export type SyncResult = 'synced' | 'offline' | 'signed_out' | 'unavailable';

async function getJson<T>(path: string): Promise<{ status: number; body: T | null }> {
  const response = await fetch('/api' + path, { headers: { accept: 'application/json' }, cache: 'no-store' });
  return { status: response.status, body: response.ok ? ((await response.json()) as T) : null };
}

/** Fetches the work pack, or only what changed since the last sync, and keeps it on the phone. */
export async function syncJobs(): Promise<SyncResult> {
  try {
    const held = await readSync();
    if (held) {
      const changes = await getJson<MobileChanges>('/mobile/changes?since=' + encodeURIComponent(held.syncToken));
      if (changes.body) {
        await writePack(applyMobileChanges(await readJobs(), changes.body), changes.body.syncToken);
        return 'synced';
      }
      if (changes.status === 401) return 'signed_out';
      // A bad token (400) means start again with the whole pack.
      if (changes.status !== 400) return 'unavailable';
    }
    const pack = await getJson<MobileWorkPack>('/mobile/work-pack');
    if (pack.body) {
      await writePack(pack.body.jobs, pack.body.syncToken);
      return 'synced';
    }
    return pack.status === 401 ? 'signed_out' : 'unavailable';
  } catch {
    return 'offline';
  }
}
