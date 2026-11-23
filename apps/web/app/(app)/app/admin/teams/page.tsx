import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { can, type AdminUser, type Team } from '@cafm/shared';
import { currentUser } from '@/lib/session';
import { readAdmin } from '@/lib/admin';
import { TeamsManager } from './teams-manager';

export const metadata: Metadata = { title: 'Teams' };

export default async function AdminTeamsPage() {
  const user = await currentUser();
  if (!can(user, 'people.read')) redirect('/app');
  const canManage = can(user, 'people.manage');
  const [teams, people] = await Promise.all([
    readAdmin<Team[]>('/teams'),
    canManage ? readAdmin<AdminUser[]>('/admin/users') : Promise.resolve([] as AdminUser[]),
  ]);
  return (
    <TeamsManager
      teams={teams}
      people={people.filter((p) => p.status === 'active').map((p) => ({ id: p.membershipId, name: p.name }))}
      canManage={canManage}
    />
  );
}
