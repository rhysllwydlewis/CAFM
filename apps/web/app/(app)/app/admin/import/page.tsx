import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { ImportBatchRecord } from '@cafm/shared';
import { currentUser } from '@/lib/session';
import { apiGet } from '@/lib/api';
import { exportable, importable } from './kinds';
import { ImportManager } from './import-manager';

export const metadata: Metadata = { title: 'Import and export' };

export default async function AdminImportPage() {
  const user = await currentUser();
  const kinds = importable(user);
  const exports = exportable(user);
  if (!kinds.length && !exports.length) redirect('/app');
  // A kind the person cannot list (for example a manager limited to some sites) just shows no history.
  const recent = await Promise.all(
    kinds.map(async (kind) => {
      const res = await apiGet(`${kind.base}/import/batches`);
      return [kind.key, res.ok ? ((await res.json()) as ImportBatchRecord[]) : []] as const;
    }),
  );
  return (
    <ImportManager
      kinds={kinds.map((k) => k.key)}
      exports={exports.map((k) => k.key)}
      batches={Object.fromEntries(recent)}
    />
  );
}
