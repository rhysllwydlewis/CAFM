import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { can, feature, type RequestPriorityInput } from '@cafm/shared';
import { currentUser } from '@/lib/session';
import { readHelpdesk } from '@/lib/helpdesk';
import styles from '../admin.module.css';

export const metadata: Metadata = { title: 'Service levels' };

interface Settings {
  types: Array<{ id: string; name: string; category: string; active: boolean }>;
  matrix: RequestPriorityInput[];
}

const LEVELS = ['High', 'Medium', 'Low'];

function duration(minutes: number) {
  if (minutes % 1440 === 0) return `${minutes / 1440} ${minutes === 1440 ? 'day' : 'days'}`;
  if (minutes % 60 === 0) return `${minutes / 60} h`;
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export default async function AdminServiceLevelsPage() {
  const user = await currentUser();
  if (!can(user, 'settings.manage')) redirect('/app');
  if (!feature(user.entitlements, 'helpdesk')) {
    return (
      <section className="card" aria-labelledby="sla-title">
        <div className="card-h">
          <h2 className="card-t" id="sla-title">
            Service levels
          </h2>
        </div>
        <p className="card-b muted">
          Service levels and request categories come with the Helpdesk module, which is not on your plan.
        </p>
      </section>
    );
  }
  const { types, matrix } = await readHelpdesk<Settings>('/settings');
  const rule = (impact: number, urgency: number) =>
    matrix.find((row) => row.impact === impact && row.urgency === urgency);
  const targets = [...new Map(matrix.map((row) => [row.priority, row])).values()].sort(
    (a, b) => a.priority - b.priority,
  );
  const categories = new Map<string, Settings['types']>();
  for (const type of types) categories.set(type.category, [...(categories.get(type.category) ?? []), type]);
  return (
    <div className="stack g4">
      <section className="card" aria-labelledby="sla-title">
        <div className="card-h">
          <h2 className="card-t" id="sla-title">
            Service levels
          </h2>
          <Link className="btn" href="/app/helpdesk/settings">
            Edit in the request catalogue
          </Link>
        </div>
        <div className="card-b stack g3">
          <p className="muted">
            Priority comes from impact and urgency. Each priority has response, attendance and fix targets, timed on
            business hours or around the clock.
          </p>
          <div className={styles.tableWrap} role="region" aria-label="Priority matrix" tabIndex={0}>
            <table className="tbl">
              <caption className="sr-only">Priority by impact and urgency</caption>
              <thead>
                <tr>
                  <th scope="col">Impact</th>
                  {LEVELS.map((level) => (
                    <th key={level} scope="col">
                      {level} urgency
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {LEVELS.map((level, i) => (
                  <tr key={level}>
                    <th scope="row">{level}</th>
                    {LEVELS.map((urgency, j) => (
                      <td key={urgency}>Priority {rule(i + 1, j + 1)?.priority ?? '–'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.tableWrap} role="region" aria-label="Targets" tabIndex={0}>
            <table className="tbl">
              <caption className="sr-only">Targets by priority</caption>
              <thead>
                <tr>
                  <th scope="col">Priority</th>
                  <th scope="col">Respond</th>
                  <th scope="col">Attend</th>
                  <th scope="col">Fix</th>
                  <th scope="col">Clock</th>
                </tr>
              </thead>
              <tbody>
                {targets.map((row) => (
                  <tr key={row.priority}>
                    <th scope="row">Priority {row.priority}</th>
                    <td>{duration(row.responseMinutes)}</td>
                    <td>{duration(row.attendMinutes)}</td>
                    <td>{duration(row.fixMinutes)}</td>
                    <td>{row.businessHours ? 'Business hours' : '24/7'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      <section className="card" aria-labelledby="categories-title">
        <div className="card-h">
          <h2 className="card-t" id="categories-title">
            Request categories
          </h2>
        </div>
        <div className="card-b stack g3">
          {categories.size === 0 && <p className="muted">No request types yet.</p>}
          {[...categories].map(([category, items]) => (
            <div key={category}>
              <h3 className="medium">{category}</h3>
              <ul>
                {items.map((type) => (
                  <li key={type.id}>
                    {type.name}
                    {!type.active && <span className="faint"> (deactivated)</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
