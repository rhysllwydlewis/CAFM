import { Icon } from '@fmstead/ui';
import {
  WORK_ORDER_FINISHED,
  WORK_ORDER_PAUSE_LABELS,
  WORK_ORDER_STATUS_LABELS,
  type WorkOrderSummary,
} from '@fmstead/shared';
import { requestTime } from '@/lib/helpdesk-format';

export const PRIORITY_LABELS = ['Emergency', 'Urgent', 'Routine', 'Planned'];

export function PriorityBadge({ priority }: { priority: number }) {
  return (
    <span className={'badge ' + (priority === 1 ? 'danger' : priority === 2 ? 'warning' : '')}>
      P{priority} {PRIORITY_LABELS[priority - 1]}
    </span>
  );
}

export function StatusBadge({ item }: { item: Pick<WorkOrderSummary, 'status' | 'pauseReason'> }) {
  const { status } = item;
  const tone = ['completed', 'verified', 'closed'].includes(status)
    ? 'success'
    : status === 'cancelled'
      ? 'danger'
      : status === 'paused'
        ? 'warning'
        : 'primary';
  return (
    <span className={'badge ' + tone}>
      {WORK_ORDER_STATUS_LABELS[item.status]}
      {item.pauseReason ? ' · ' + WORK_ORDER_PAUSE_LABELS[item.pauseReason] : ''}
    </span>
  );
}

export function duration(ms: number) {
  const minutes = Math.ceil(Math.abs(ms) / 60_000);
  if (minutes < 60) return minutes + ' min';
  if (minutes < 2880) return Math.floor(minutes / 60) + 'h ' + (minutes % 60) + 'm';
  return Math.floor(minutes / 1440) + 'd';
}

/** How the fix target is going: time left, time overdue, or whether it was met. */
export function FixSla({ item, now }: { item: WorkOrderSummary; now: number }) {
  if (!item.fixDueAt) return <span>—</span>;
  const due = new Date(item.fixDueAt).getTime();
  if (item.status === 'cancelled') return <span>—</span>;
  if (item.completedAt) {
    const met = new Date(item.completedAt).getTime() <= due;
    return <span className={'badge ' + (met ? 'success' : 'danger')}>{met ? 'Met' : 'Missed'}</span>;
  }
  if (WORK_ORDER_FINISHED.includes(item.status)) return <span>—</span>;
  // While the clock is stopped by a pause there is no countdown: the targets move on when work resumes.
  if (item.slaPausedAt) {
    return (
      <span className="badge" title={'The SLA clock has been stopped since ' + requestTime(item.slaPausedAt)}>
        <Icon name="sla" size={14} />
        Clock stopped
      </span>
    );
  }
  const remaining = due - now;
  const late = remaining < 0;
  const soon = !late && remaining <= 60 * 60_000;
  return (
    <span className={'badge ' + (late ? 'danger' : soon ? 'warning' : '')} title={requestTime(item.fixDueAt)}>
      <Icon name="sla" size={14} />
      {late ? 'Breached ' + duration(remaining) : (soon ? 'At risk · ' : 'Fix in ') + duration(remaining)}
    </span>
  );
}
