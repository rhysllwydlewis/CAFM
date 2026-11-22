import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { can, feature } from '@cafm/shared';
import { Icon } from '@cafm/ui';
import { criticalityBadge, criticalityLabel, hours } from '@/lib/ppm-format';
import { ppmTemplates } from '@/lib/ppm';
import { currentUser } from '@/lib/session';
import styles from '../ppm.module.css';

export const metadata: Metadata = { title: 'PPM task library' };

export default async function TaskLibraryPage() {
  const user = await currentUser();
  if (!feature(user.entitlements, 'ppm') || !can(user, 'ppm.read')) redirect('/app/ppm');
  const tasks = await ppmTemplates();
  const canManage = can(user, 'ppm.manage');
  return (
    <div className="page stack g4">
      <div className="page-head">
        <div className="stack g2">
          <Link href="/app/ppm">Planned maintenance</Link>
          <h1 className="page-title">Task library</h1>
          <p className="page-sub">
            {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}. Each is copied onto the jobs a schedule raises.
          </p>
        </div>
        {canManage && (
          <div className={'page-actions ' + styles.actions}>
            <Link href="/app/ppm/tasks/new" className="btn primary">
              <Icon name="add" /> New task
            </Link>
          </div>
        )}
      </div>
      <section className="card">
        {tasks.length === 0 ? (
          <p className="card-b muted">The library is empty. {canManage && 'Use New task to add the first.'}</p>
        ) : (
          <div className={styles.tableWrap} role="region" aria-label="Tasks" tabIndex={0}>
            <table className="tbl">
              <thead>
                <tr>
                  {['Task', 'Discipline', 'Time', 'Steps', 'Schedules'].map((label) => (
                    <th key={label} scope="col">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id}>
                    <td>
                      {canManage ? (
                        <Link href={'/app/ppm/tasks/' + task.id} className="medium">
                          {task.name}
                        </Link>
                      ) : (
                        <span className="medium">{task.name}</span>
                      )}
                      <div>
                        <span className={'badge ' + criticalityBadge(task.criticality)}>
                          {criticalityLabel(task.criticality)}
                        </span>
                      </div>
                    </td>
                    <td>{task.discipline ?? '—'}</td>
                    <td>{hours(task.durationMinutes)} h</td>
                    <td>{task.steps.length}</td>
                    <td>{task.schedules}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
