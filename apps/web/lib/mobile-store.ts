import type { MobilePackJob, OutboxChange, OutboxEntry } from '@cafm/shared';

/** The technician app's offline store: the jobs on the phone and the sync token. Cleared on sign out. */
const DB_NAME = 'cafm-mobile';
const VERSION = 2;

/** `owner` is the membership the jobs were saved for. Another person never sees them. */
type Meta = { key: 'sync'; syncToken: string; syncedAt: string; owner: string };

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const names = request.result.objectStoreNames;
      if (!names.contains('jobs')) request.result.createObjectStore('jobs', { keyPath: 'id' });
      if (!names.contains('meta')) request.result.createObjectStore('meta', { keyPath: 'key' });
      // Changes made offline, in the order they were made. A photo's file sits in the same record.
      if (!names.contains('outbox')) request.result.createObjectStore('outbox', { keyPath: 'id' });
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

export type ScanRecord = { code: string; label: string; scannedAt: string };
const MAX_SCANS = 20;

/** The last things scanned on this phone, newest first. Kept with the saved jobs, so it goes when they do. */
export async function readScans(): Promise<ScanRecord[]> {
  const row = await run<{ key: string; scans: ScanRecord[] } | undefined>(['meta'], 'readonly', (tx) =>
    tx.objectStore('meta').get('scans'),
  );
  return row?.scans ?? [];
}

export async function addScan(record: ScanRecord): Promise<void> {
  await run(['meta'], 'readwrite', (tx) => {
    const store = tx.objectStore('meta');
    const read = store.get('scans');
    read.onsuccess = () => {
      const held = ((read.result as { scans?: ScanRecord[] } | undefined)?.scans ?? []).filter(
        (scan) => scan.code !== record.code,
      );
      store.put({ key: 'scans', scans: [record, ...held].slice(0, MAX_SCANS) });
    };
  });
}

export async function clearStore(): Promise<void> {
  await run(['jobs', 'meta', 'outbox'], 'readwrite', (tx) => {
    tx.objectStore('jobs').clear();
    tx.objectStore('meta').clear();
    tx.objectStore('outbox').clear();
  });
}

/** An outbox record: the entry, and for a photo its file. */
export type OutboxRecord = OutboxEntry & { file?: Blob; image?: string };

export async function readOutbox(): Promise<OutboxRecord[]> {
  return ((await run<OutboxRecord[]>(['outbox'], 'readonly', (tx) => tx.objectStore('outbox').getAll())) ?? []).sort(
    (a, b) => a.seq - b.seq,
  );
}

/** Adds a change to the end of the queue. One transaction, so two quick taps never get the same place. */
export async function enqueue(
  workOrderId: string,
  change: OutboxChange,
  extra: { file?: Blob; image?: string } = {},
  id: string = crypto.randomUUID(),
): Promise<OutboxRecord> {
  const record = {
    id,
    seq: 0,
    createdAt: new Date().toISOString(),
    workOrderId,
    state: 'pending',
    message: null,
    change,
  } as OutboxRecord;
  if (extra.file) record.file = extra.file;
  if (extra.image) record.image = extra.image;
  await run(['outbox'], 'readwrite', (tx) => {
    const store = tx.objectStore('outbox');
    // The key is a random id, so the highest sequence number is found by reading them, not by key order.
    const all = store.getAll();
    all.onsuccess = () => {
      record.seq = Math.max(0, ...(all.result as OutboxRecord[]).map((row) => row.seq)) + 1;
      store.put(record);
    };
  });
  return record;
}

/** Replaces a record, for example to mark it refused. */
export async function updateOutbox(record: OutboxRecord): Promise<void> {
  await run(['outbox'], 'readwrite', (tx) => {
    tx.objectStore('outbox').put(record);
  });
}

export async function removeFromOutbox(id: string): Promise<void> {
  await run(['outbox'], 'readwrite', (tx) => {
    tx.objectStore('outbox').delete(id);
  });
}

/**
 * Puts a refused change back in the queue to be sent again. It goes to the end under a new key, because the
 * server keeps the first answer against the old key and would only repeat the refusal.
 */
export async function retryOutboxEntry(record: OutboxRecord): Promise<void> {
  const id = crypto.randomUUID();
  const change =
    record.change.type === 'mutation' ? { ...record.change, item: { ...record.change.item, key: id } } : record.change;
  await removeFromOutbox(record.id);
  await enqueue(
    record.workOrderId,
    change,
    { ...(record.file ? { file: record.file } : {}), ...(record.image ? { image: record.image } : {}) },
    id,
  );
}
