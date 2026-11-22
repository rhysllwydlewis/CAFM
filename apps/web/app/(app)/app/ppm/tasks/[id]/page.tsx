import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { can, feature } from '@cafm/shared';
import { ppmTemplates } from '@/lib/ppm';
import { currentUser } from '@/lib/session';
import { TaskForm } from '../../task-form';

export const metadata: Metadata = { title: 'PPM task' };

export default async function EditTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!feature(user.entitlements, 'ppm') || !can(user, 'ppm.manage')) redirect('/app/ppm');
  const { id } = await params;
  const task = (await ppmTemplates()).find((candidate) => candidate.id === id);
  if (!task) notFound();
  return (
    <div className="page stack g4">
      <div className="page-head">
        <div className="stack g2">
          <Link href="/app/ppm/tasks">Task library</Link>
          <h1 className="page-title">{task.name}</h1>
          <p className="page-sub">
            Changing a task changes the jobs raised from now on. Jobs already raised keep their steps.
          </p>
        </div>
      </div>
      <TaskForm key={task.version} task={task} />
    </div>
  );
}
