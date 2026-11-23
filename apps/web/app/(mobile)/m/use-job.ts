'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  localChecklists,
  localStatus,
  nextStatusVersion,
  type MobileMutationItem,
  type MobilePackJob,
  type OutboxChange,
  type WorkOrderStatus,
} from '@cafm/shared';
import { enqueue, readJob, readOutbox, type OutboxRecord } from '@/lib/mobile-store';
import { flushOutbox } from '@/lib/mobile-sync-client';

/** One job from the phone's store, with what the person has done to it offline laid over it. */
export function useJob(id: string) {
  const [job, setJob] = useState<MobilePackJob | null | undefined>(undefined);
  const [queue, setQueue] = useState<OutboxRecord[]>([]);

  const reload = useCallback(async () => {
    setJob(await readJob(id));
    setQueue((await readOutbox()).filter((record) => record.workOrderId === id));
  }, [id]);
  useEffect(() => {
    void reload();
  }, [reload]);

  // Signal came back while this screen is open: send what is waiting, then show what is left.
  useEffect(() => {
    const onOnline = () => void flushOutbox().then(reload);
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [reload]);

  const status = useMemo(() => (job ? localStatus(job, queue) : null), [job, queue]);
  const checklists = useMemo(() => (job ? localChecklists(job, queue) : []), [job, queue]);

  /** Saves a change on the phone first, so it is never lost, then tries to send it if there is signal. */
  const queueChange = useCallback(
    async (change: OutboxChange, extra?: { file?: Blob; image?: string }) => {
      const id = crypto.randomUUID();
      const item = change.type === 'mutation' ? ({ ...change.item, key: id } as MobileMutationItem) : null;
      await enqueue(job!.id, item ? { type: 'mutation', item } : change, extra, id);
      await reload();
      if (navigator.onLine) void flushOutbox().then(reload);
    },
    [job, reload],
  );

  const changeStatus = useCallback(
    (to: WorkOrderStatus, note?: string) =>
      queueChange({
        type: 'mutation',
        item: {
          key: '',
          kind: 'status',
          workOrderId: job!.id,
          payload: { version: nextStatusVersion(job!, queue), status: to, ...(note ? { note } : {}) },
        },
      }),
    [job, queue, queueChange],
  );

  return { job, queue, status, checklists, queueChange, changeStatus, reload };
}
