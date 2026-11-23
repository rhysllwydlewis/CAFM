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
  const users = await readAdmin<AdminUser[]>('/admin/users');
  const [roles, invites] = await Promise.all([
    can(user, 'roles.read')
      ? readAdmin<RoleOption[]>('/roles')
      : Promise.resolve([
          ...new Map(users.map((u) => [u.role, { key: u.role, name: u.roleLabel }])).values(),
        ] as RoleOption[]),
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
