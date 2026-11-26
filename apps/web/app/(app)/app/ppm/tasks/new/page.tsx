import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { can, feature } from '@fmstead/shared';
import { currentUser } from '@/lib/session';
import { TaskForm } from '../../task-form';

export const metadata: Metadata = { title: 'New PPM task' };

export default async function NewTaskPage() {
  const user = await currentUser();
  if (!feature(user.entitlements, 'ppm') || !can(user, 'ppm.manage')) redirect('/app/ppm');
  return (
    <div className="page stack g4">
      <div className="page-head">
        <div className="stack g2">
          <Link href="/app/ppm/tasks">Task library</Link>
          <h1 className="page-title">New task</h1>
        </div>
      </div>
      <TaskForm />
    </div>
  );
}
