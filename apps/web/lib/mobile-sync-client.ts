import {
  applyMobileChanges,
  missingMobileJobIds,
  outboxFailureMessage,
  outboxOutcome,
  type MobileChanges,
  type MobileWorkPack,
} from '@cafm/shared';
import {
  clearIfNotOwner,
  clearStore,
  readJobs,
  readOutbox,
  readSync,
  removeFromOutbox,
  updateOutbox,
  writePack,
  type OutboxRecord,
} from './mobile-store';

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

export type FlushResult = { sent: number; failed: number; stopped: 'offline' | 'signed_out' | 'unavailable' | null };

async function failureText(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
  return Array.isArray(body?.message) ? body.message.join(' ') : (body?.message ?? '');
}

/** Sends one photo or signature through the website's own endpoint. Both are safe to send twice. */
async function sendOne(record: OutboxRecord): Promise<Response> {
  const { change } = record;
  if (change.type === 'photo') {
    const form = new FormData();
    form.set('file', record.file!, change.filename);
    const query = new URLSearchParams({ phase: change.phase });
    if (change.caption) query.set('caption', change.caption);
    return fetch(`/api/work-orders/${record.workOrderId}/photos?${query}`, { method: 'PUT', body: form });
  }
  if (change.type !== 'signature') throw new Error('not a file change');
  return fetch(`/api/work-orders/${record.workOrderId}/signatures`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      role: change.role,
      ...(change.signerName ? { signerName: change.signerName } : {}),
      image: record.image,
    }),
  });
}

async function settle(record: OutboxRecord, code: string | undefined, message: string | undefined): Promise<void> {
  await updateOutbox({ ...record, state: 'failed', message: outboxFailureMessage(code, message) });
}

/**
 * Sends what was done offline, in the order it was done, then stops at the first sign that there is no
 * signal. An applied change leaves the queue. A change the server refuses stays, marked failed, so a
 * person sees it: nothing is dropped quietly.
 */
export async function flushOutbox(): Promise<FlushResult> {
  const result: FlushResult = { sent: 0, failed: 0, stopped: null };
  try {
    const queue = (await readOutbox()).filter((record) => record.state === 'pending');
    for (let i = 0; i < queue.length;) {
      const record = queue[i]!;
      if (record.change.type === 'mutation') {
        const batch: OutboxRecord[] = [];
        while (batch.length < 50 && queue[i] && queue[i]!.change.type === 'mutation') batch.push(queue[i++]!);
        const response = await fetch('/api/mobile/mutations', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            mutations: batch.map((entry) => (entry.change as { item: unknown }).item),
          }),
        });
        if (response.status === 401) return { ...result, stopped: 'signed_out' };
        if (response.status === 403 || response.status >= 500) return { ...result, stopped: 'unavailable' };
        if (!response.ok) {
          // The whole request was refused (for example a bad shape): mark them so a person sees why.
          const message = await failureText(response);
          for (const entry of batch) await settle(entry, 'invalid', message);
          result.failed += batch.length;
          continue;
        }
        const { results } = (await response.json()) as {
          results: { key: string; status: 'applied' | 'rejected'; code?: string; message?: string }[];
        };
        for (const entry of batch) {
          const outcome = results.find((row) => row.key === entry.id);
          if (!outcome) continue;
          if (outboxOutcome(outcome) === 'done') {
            await removeFromOutbox(entry.id);
            result.sent += 1;
          } else {
            await settle(entry, outcome.code, outcome.message);
            result.failed += 1;
          }
        }
        continue;
      }
      i += 1;
      const response = await sendOne(record);
      if (response.status === 401) return { ...result, stopped: 'signed_out' };
      if (response.status >= 500 || response.status === 429) return { ...result, stopped: 'unavailable' };
      // A signature already on the job is the same signature arriving twice.
      if (response.ok || (record.change.type === 'signature' && response.status === 409)) {
        await removeFromOutbox(record.id);
        result.sent += 1;
      } else {
        await settle(
          record,
          response.status === 403 ? 'forbidden' : response.status === 404 ? 'not_found' : undefined,
          await failureText(response),
        );
        result.failed += 1;
      }
    }
    return result;
  } catch {
    return { ...result, stopped: 'offline' };
  }
}
