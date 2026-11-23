'use client';

import { useCallback, useEffect, useState } from 'react';
import { readOutbox, type OutboxRecord } from '@/lib/mobile-store';

/** The changes waiting on the phone, newest state first read from the store. */
export function useOutbox() {
  const [records, setRecords] = useState<OutboxRecord[] | null>(null);
  const reload = useCallback(async () => setRecords(await readOutbox()), []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { records, reload };
}
