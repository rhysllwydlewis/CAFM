'use client';

import { Icon } from '@cafm/ui';
import { WORK_ORDER_FINISHED, type WorkOrderRecord } from '@cafm/shared';
import { requestTime } from '@/lib/helpdesk-format';
import { duration } from './work-order-parts';
import { useClock } from './work-order-table';
import styles from './work-orders.module.css';

type Target = {
  label: string;
  due: string | null;
  /** When the target was met, if it has been. */
  doneAt: string | null;
  /** Whether a pause can stop this target's clock. Response is over before any pause. */
  pausable: boolean;
};

/** Where the job stands against each of its three targets, with the clock ticking while the page is open. */
export function WorkOrderSla({ record, now }: { record: WorkOrderRecord; now: number }) {
  const clock = useClock(now);
  const finished = WORK_ORDER_FINISHED.includes(record.status);
  const targets: Target[] = [
    { label: 'Response', due: record.responseDueAt, doneAt: record.firstResponseAt, pausable: false },
    { label: 'Attendance', due: record.attendDueAt, doneAt: record.attendedAt, pausable: true },
    { label: 'Fix', due: record.fixDueAt, doneAt: record.completedAt, pausable: true },
  ];

  return (
    <section className="card card-b stack g3" aria-labelledby="wo-sla">
      <h2 className="card-t" id="wo-sla">
        SLA targets
      </h2>
      <dl className={'kv ' + styles.sla}>
        {targets.map(({ label, due, doneAt, pausable }) => {
          let state: { text: string; tone: string };
          if (!due) state = { text: 'No target', tone: '' };
          else if (doneAt) {
            const late = new Date(doneAt).getTime() - new Date(due).getTime();
            state =
              late <= 0 ? { text: 'Met', tone: 'success' } : { text: 'Missed by ' + duration(late), tone: 'danger' };
          } else if (finished) state = { text: 'Not applicable', tone: '' };
          else if (pausable && record.slaPausedAt) state = { text: 'Clock stopped', tone: '' };
          else {
            const left = new Date(due).getTime() - clock;
            state =
              left < 0
                ? { text: 'Breached by ' + duration(left), tone: 'danger' }
                : { text: duration(left) + ' left', tone: left <= 60 * 60_000 ? 'warning' : '' };
          }
          return (
            <div key={label} className="row wrap between g2">
              <dt>{label}</dt>
              <dd title={due ? 'Due ' + requestTime(due) : undefined}>
                <span className={'badge ' + state.tone}>
                  {state.tone === 'danger' || state.tone === 'warning' ? <Icon name="sla" size={14} /> : null}
                  {state.text}
                </span>
              </dd>
            </div>
          );
        })}
      </dl>
      <p className="sm muted">
        Response is the first pick-up of the job, attendance the first time someone is on site, and fix when it is
        completed.
      </p>
    </section>
  );
}
