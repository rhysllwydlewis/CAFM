import { applyMobileChanges, missingMobileJobIds, type MobileChanges, type MobileWorkPack } from '@cafm/shared';
import { clearIfNotOwner, clearStore, readJobs, readSync, writePack } from './mobile-store';

export type SyncResult = 'synced' | 'offline' | 'signed_out' | 'unavailable';

async function getJson<T>(path: string): Promise<{ status: number; body: T | null }> {
  const response = await fetch('/api' + path, { headers: { accept: 'application/json' }, cache: 'no-store' });
  return { status: response.status, body: response.ok ? ((await response.json()) as T) : null };
}

/** No access to the mobile app (role or plan): nothing from an earlier session should stay on show. */
async function forbidden(): Promise<SyncResult> {
  await clearStore();
  return 'unavailable';
}

/** Fetches the work pack, or only what changed since the last sync, and keeps it on the phone. */
export async function syncJobs(owner: string): Promise<SyncResult> {
  try {
    await clearIfNotOwner(owner);
    const held = await readSync();
    if (held) {
      const changes = await getJson<MobileChanges>('/mobile/changes?since=' + encodeURIComponent(held.syncToken));
      if (changes.body) {
        const jobs = await readJobs();
        // An id with no job (a capped list moved an unchanged job in) means the delta can't be trusted:
        // fall through and fetch the whole pack instead of saving a token that hides the job.
        if (missingMobileJobIds(jobs, changes.body).length === 0) {
          await writePack(applyMobileChanges(jobs, changes.body), changes.body.syncToken, owner);
          return 'synced';
        }
      } else {
        if (changes.status === 401) return 'signed_out';
        if (changes.status === 403) return forbidden();
        // A bad token (400) means start again with the whole pack.
        if (changes.status !== 400) return 'unavailable';
      }
    }
    const pack = await getJson<MobileWorkPack>('/mobile/work-pack');
    if (pack.body) {
      await writePack(pack.body.jobs, pack.body.syncToken, owner);
      return 'synced';
    }
    if (pack.status === 403) return forbidden();
    return pack.status === 401 ? 'signed_out' : 'unavailable';
  } catch {
    return 'offline';
  }
}
