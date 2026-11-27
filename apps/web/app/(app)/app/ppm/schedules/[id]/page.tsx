import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { can, feature, formatMinor, frequencyText, PPM_MODE_LABELS } from '@fmstead/shared';
import { Icon } from '@fmstead/ui';
import { criticalityBadge, criticalityLabel, hours, longDay } from '@/lib/ppm-format';
import { ppmSchedule } from '@/lib/ppm';
import { currentUser } from '@/lib/session';
import { GenerateButton } from '../../generate-button';
import { ScheduleAssets } from '../../schedule-assets';
import styles from '../../ppm.module.css';

export const metadata: Metadata = { title: 'PPM schedule' };

const STATE_LABELS = { scheduled: 'Scheduled', due: 'Due', overdue: 'Overdue', completed: 'Done' } as const;
const STATE_BADGES = { scheduled: 'outline', due: 'primary', overdue: 'danger', completed: 'success' } as const;

export default async function ScheduleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!feature(user.entitlements, 'ppm') || !can(user, 'ppm.read')) redirect('/app/ppm');
  const { id } = await params;
  const schedule = await ppmSchedule(id);
  if (!schedule) notFound();
  const canManage = can(user, 'ppm.manage');
  const meter = schedule.frequency.type === 'meter' ? schedule.frequency.meterName : null;

  const facts: [string, React.ReactNode][] = [
    ['How often', frequencyText(schedule.frequency)],
    ['Type', PPM_MODE_LABELS[schedule.mode]],
    ['Raised', `${schedule.leadDays} days ahead`],
    ['Next due', schedule.nextDueOn ? longDay(schedule.nextDueOn) : meter ? 'By meter reading' : '—'],
    ['First visit', longDay(schedule.startsOn)],
    ['Time for each visit', `${hours(schedule.durationMinutes)} h`],
    ['Priority', `P${schedule.priority}`],
    ['Assigned to', schedule.assigneeName ?? 'Nobody yet'],
    ...(schedule.templateName ? ([['Task', schedule.templateName]] as [string, React.ReactNode][]) : []),
    ...(schedule.skills ? ([['Skills', schedule.skills]] as [string, React.ReactNode][]) : []),
    ...(schedule.estimatedCostMinor !== null
      ? ([['Estimated cost of a visit', formatMinor(schedule.estimatedCostMinor, schedule.currency)]] as [
          string,
          React.ReactNode,
        ][])
      : []),
  ];

  return (
    <div className="page stack g4">
      <div className="page-head">
        <div className="stack g2">
          <Link href="/app/ppm">Planned maintenance</Link>
          <div className="row wrap g2">
            <span className="ref">{schedule.number}</span>
            <span className={'badge ' + criticalityBadge(schedule.criticality)}>
              {criticalityLabel(schedule.criticality)}
            </span>
            {schedule.discipline && <span className="badge outline">{schedule.discipline}</span>}
            {!schedule.active && <span className="badge outline">Archived</span>}
          </div>
          <h1 className="page-title">{schedule.title}</h1>
        </div>
        {canManage && (
          <div className={'page-actions ' + styles.actions}>
            {schedule.active && <GenerateButton path={`/ppm/schedules/${schedule.id}/generate`} />}
            <Link href={`/app/ppm/schedules/${schedule.id}/edit`} className="btn">
              <Icon name="edit" /> Edit schedule
            </Link>
          </div>
        )}
      </div>

      <div className={styles.columns}>
        <div className="stack g4">
          <section className="card card-b stack g3" aria-labelledby="ppm-assets">
            <h2 className="card-t" id="ppm-assets">
              Assets on this schedule
            </h2>
            {schedule.rows.length > 0 && (
              <div className={styles.tableWrap} role="region" aria-label="Assets" tabIndex={0}>
                <table className="tbl">
                  <thead>
                    <tr>
                      {['Asset', 'Location', 'Last done', meter ? 'Next due at' : 'Next due', 'Status'].map((label) => (
                        <th key={label} scope="col">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.rows.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <Link href={'/app/assets/' + row.asset.id} className="medium">
                            {row.asset.name}
                          </Link>
                          <div className="sm muted">{row.asset.number}</div>
                        </td>
                        <td>{row.location.name}</td>
                        <td>{row.lastDoneOn ? longDay(row.lastDoneOn) : '—'}</td>
                        <td>
                          {row.nextDueOn
                            ? longDay(row.nextDueOn)
                            : row.nextDueTotal
                              ? `${row.nextDueTotal}${row.currentTotal ? ` (now ${row.currentTotal})` : ''}`
                              : '—'}
                        </td>
                        <td>
                          {row.state ? (
                            <span className={'badge ' + STATE_BADGES[row.state]}>{STATE_LABELS[row.state]}</span>
                          ) : (
                            '—'
                          )}
                          {row.openJob && (
                            <div className="sm">
                              <Link href={'/app/work-orders/' + row.openJob.id}>
                                {longDay(row.openJob.scheduledFor)}
                              </Link>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {canManage ? (
              <ScheduleAssets
                scheduleId={schedule.id}
                version={schedule.version}
                meterName={meter}
                assets={schedule.rows.map((row) => ({
                  id: row.asset.id,
                  number: row.asset.number,
                  name: row.asset.name,
                  location: row.location.name,
                }))}
              />
            ) : (
              schedule.rows.length === 0 && <p className="muted">No assets are on this schedule.</p>
            )}
          </section>

          <section className="card card-b stack g3" aria-labelledby="ppm-steps">
            <h2 className="card-t" id="ppm-steps">
              Task steps
            </h2>
            {schedule.steps.length ? (
              <div className={styles.tableWrap} role="region" aria-label="Task steps" tabIndex={0}>
                <table className="tbl">
                  <thead>
                    <tr>
                      {['#', 'Step', 'Response', 'Required'].map((label) => (
                        <th key={label} scope="col">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.steps.map((step, index) => (
                      <tr key={index}>
                        <td>{index + 1}</td>
                        <td>{step.label}</td>
                        <td>
                          {{ tick: 'Done', pass_fail: 'Pass or fail', number: 'Reading', text: 'Comment' }[step.kind]}
                          {step.unit ? ` (${step.unit})` : ''}
                        </td>
                        <td>{step.required ? 'Yes' : 'No'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">
                {schedule.templateName ? 'This task has no steps.' : 'No task has been chosen for this schedule.'}
              </p>
            )}
            {schedule.safetyNotes && (
              <p>
                <strong>Safety: </strong>
                {schedule.safetyNotes}
              </p>
            )}
          </section>
        </div>

        <section className="card card-b stack g3" aria-labelledby="ppm-facts">
          <h2 className="card-t" id="ppm-facts">
            Schedule
          </h2>
          <dl className={styles.facts}>
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt className="muted">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {schedule.overdue > 0 && (
            <p>
              <span className="badge danger">{schedule.overdue} overdue</span>
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
