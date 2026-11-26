import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { can } from '@fmstead/shared';
import type { FieldDefinition } from '@fmstead/config-engine';
import { currentUser } from '@/lib/session';
import { readAdmin } from '@/lib/admin';
import { FieldsManager } from './fields-manager';

export const metadata: Metadata = { title: 'Custom fields' };

export interface AdminField extends FieldDefinition {
  id: string;
  entityType: string;
  helpText: string | null;
  active: boolean;
}

export default async function AdminFieldsPage() {
  const user = await currentUser();
  if (!can(user, 'settings.manage')) redirect('/app');
  const data = await readAdmin<{ fields: AdminField[]; limit: number | null }>('/config/fields/all');
  return <FieldsManager fields={data.fields} limit={data.limit} />;
}
