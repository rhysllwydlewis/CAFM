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
} from '@fmstead/shared';
import { enqueue, readJob, readOutbox, type OutboxRecord } from '@/lib/mobile-store';
import { flushOutbox, syncJobs } from '@/lib/mobile-sync-client';
import { useMembershipId } from './mobile-shell';

/** One job from the phone's store, with what the person has done to it offline laid over it. */
export function useJob(id: string) {
  const [job, setJob] = useState<MobilePackJob | null | undefined>(undefined);
  const [queue, setQueue] = useState<OutboxRecord[]>([]);

  const owner = useMembershipId();

  const reload = useCallback(async () => {
    setJob(await readJob(id));
    setQueue((await readOutbox()).filter((record) => record.workOrderId === id));
  }, [id]);
  useEffect(() => {
    void reload();
  }, [reload]);

  // Sends what is waiting. When anything was applied the saved jobs are refreshed too, so the job's new
  // status, answers and version replace the overlay that is removed with the queue entry.
  const flush = useCallback(async () => {
    const sent = await flushOutbox();
    if (sent.sent > 0 && !sent.stopped) await syncJobs(owner);
    await reload();
  }, [owner, reload]);

  // Signal came back while this screen is open: send what is waiting, then show what is left.
  useEffect(() => {
    const onOnline = () => void flush();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [flush]);

  const status = useMemo(() => (job ? localStatus(job, queue) : null), [job, queue]);
  const checklists = useMemo(() => (job ? localChecklists(job, queue) : []), [job, queue]);

  /** Saves a change on the phone first, so it is never lost, then tries to send it if there is signal. */
  const queueChange = useCallback(
    async (change: OutboxChange, extra?: { file?: Blob; image?: string }) => {
      const id = crypto.randomUUID();
      const item = change.type === 'mutation' ? ({ ...change.item, key: id } as MobileMutationItem) : null;
      await enqueue(job!.id, item ? { type: 'mutation', item } : change, extra, id);
      await reload();
      if (navigator.onLine) void flush();
    },
    [job, reload, flush],
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
