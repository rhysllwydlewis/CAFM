import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { can } from '@cafm/shared';
import { currentUser } from '@/lib/session';
import { AdminMenu } from './admin-menu';
import styles from './admin.module.css';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  if (!can(user, 'roles.read') && !can(user, 'people.manage') && !can(user, 'people.read')) redirect('/app');
  return (
    <div className="page stack g4">
      <div className="page-head">
        <div>
          <h1 className="page-title">Administration</h1>
          <div className="page-sub">{user.tenant.name}</div>
        </div>
      </div>
      <div className={styles.shell}>
        <AdminMenu
          canManageSettings={can(user, 'settings.manage')}
          canManagePeople={can(user, 'people.manage')}
          canReadRoles={can(user, 'roles.read')}
          canReadPeople={can(user, 'people.read')}
        />
        <div className="stack g4">{children}</div>
      </div>
    </div>
  );
}
