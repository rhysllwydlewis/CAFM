'use client';

import { useState } from 'react';
import type { ReportLocation } from '@fmstead/shared';
import { RecordPicker } from './record-picker';

export function QueueLocationFilter({ initial }: { initial: ReportLocation | null }) {
  const [selected, setSelected] = useState<{ id: string; name: string; code?: string } | null>(initial);
  return (
    <>
      <input type="hidden" name="locationId" value={selected?.id ?? ''} />
      <RecordPicker label="Location" path="/helpdesk/queue-locations" value={selected} onChange={setSelected} />
    </>
  );
}
