import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { can, type AdminUser } from '@cafm/shared';
import { currentUser } from '@/lib/session';
import { readAdmin } from '@/lib/admin';
import { UsersManager, type PendingInvite, type RoleOption } from './users-manager';

export const metadata: Metadata = { title: 'Users and licences' };

export default async function AdminUsersPage() {
  const user = await currentUser();
  if (!can(user, 'people.manage')) redirect(can(user, 'settings.manage') ? '/app/admin' : '/app');
  const canInvite = can(user, 'people.invite');
  const [users, roles, invites] = await Promise.all([
    readAdmin<AdminUser[]>('/admin/users'),
    readAdmin<RoleOption[]>('/roles'),
    canInvite ? readAdmin<PendingInvite[]>('/people/invites') : Promise.resolve([] as PendingInvite[]),
  ]);
  return (
    <UsersManager
      users={users}
      roles={roles.map(({ key, name }) => ({ key, name }))}
      invites={invites}
      canInvite={canInvite}
      selfMembershipId={user.membershipId}
    />
  );
}
