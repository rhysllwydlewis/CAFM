import type { MobilePackJob } from '@cafm/shared';

/** The technician app's offline store: the jobs on the phone and the sync token. Cleared on sign out. */
const DB_NAME = 'cafm-mobile';
const VERSION = 1;

/** `owner` is the membership the jobs were saved for. Another person never sees them. */
type Meta = { key: 'sync'; syncToken: string; syncedAt: string; owner: string };

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('jobs', { keyPath: 'id' });
      request.result.createObjectStore('meta', { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run<T>(
  stores: string[],
  mode: IDBTransactionMode,
  work: (tx: IDBTransaction) => IDBRequest<T> | void,
): Promise<T | undefined> {
  return open().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction(stores, mode);
        const request = work(tx);
        tx.oncomplete = () => {
          db.close();
          resolve(request ? request.result : undefined);
        };
        tx.onerror = tx.onabort = () => {
          db.close();
          reject(tx.error);
        };
      }),
  );
}

/** Deletes whatever is saved if it belongs to someone else (another person or organisation on this browser). */
export async function clearIfNotOwner(owner: string): Promise<void> {
  const held = await readSync();
  if (held && held.owner !== owner) await clearStore();
}

export async function readJobs(): Promise<MobilePackJob[]> {
  return ((await run<MobilePackJob[]>(['jobs'], 'readonly', (tx) => tx.objectStore('jobs').getAll())) ?? []).sort(
    (a, b) => a.priority - b.priority || (a.scheduledFor ?? '9').localeCompare(b.scheduledFor ?? '9'),
  );
}

export async function readJob(id: string): Promise<MobilePackJob | null> {
  return (await run<MobilePackJob | undefined>(['jobs'], 'readonly', (tx) => tx.objectStore('jobs').get(id))) ?? null;
}

export async function readSync(): Promise<Meta | null> {
  return (await run<Meta | undefined>(['meta'], 'readonly', (tx) => tx.objectStore('meta').get('sync'))) ?? null;
}

/** Replaces everything held with these jobs and the new token, in one transaction. */
export async function writePack(jobs: MobilePackJob[], syncToken: string, owner: string): Promise<void> {
  await run(['jobs', 'meta'], 'readwrite', (tx) => {
    const store = tx.objectStore('jobs');
    store.clear();
    for (const job of jobs) store.put(job);
    tx.objectStore('meta').put({ key: 'sync', syncToken, syncedAt: new Date().toISOString(), owner } satisfies Meta);
  });
}

export async function clearStore(): Promise<void> {
  await run(['jobs', 'meta'], 'readwrite', (tx) => {
    tx.objectStore('jobs').clear();
    tx.objectStore('meta').clear();
  });
}
