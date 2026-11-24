import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { can } from '@cafm/shared';
import { currentUser } from '@/lib/session';
import { readAdmin } from '@/lib/admin';
import { RolesManager, type RoleRow } from './roles-manager';

export const metadata: Metadata = { title: 'Roles and permissions' };

export default async function AdminRolesPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const [{ role }, user] = await Promise.all([searchParams, currentUser()]);
  if (!can(user, 'roles.read')) redirect(can(user, 'people.manage') ? '/app/admin/users' : '/app');
  const roles = await readAdmin<RoleRow[]>('/roles');
  const selected = roles.find((r) => r.key === role) ?? roles.find((r) => r.key === 'super_user') ?? roles[0];
  return (
    <RolesManager
      key={selected?.id}
      roles={roles}
      selected={selected?.key}
      canManage={can(user, 'roles.manage')}
      held={user.permissions}
    />
  );
}
