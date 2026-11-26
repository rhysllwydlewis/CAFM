'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@fmstead/ui';
import {
  WORK_ORDER_STATUS_LABELS,
  workOrderNextStatuses,
  type WorkOrderStatus,
  type WorkOrderSummary,
} from '@fmstead/shared';
import { helpdeskWrite } from '@/lib/helpdesk-client';
import { FixSla, PriorityBadge } from './work-order-parts';
import { useClock } from './work-order-table';
import styles from './work-orders.module.css';

const LANES: { title: string; statuses: WorkOrderStatus[] }[] = [
  { title: 'To assign', statuses: ['logged'] },
  { title: 'Assigned', statuses: ['assigned', 'accepted', 'travelling'] },
  { title: 'In progress', statuses: ['on_site'] },
  { title: 'On hold', statuses: ['paused'] },
  { title: 'Completed', statuses: ['completed', 'verified'] },
];

function Card({
  item,
  now,
  permissions,
  onMove,
}: {
  item: WorkOrderSummary;
  now: number;
  permissions: string[];
  onMove: (item: WorkOrderSummary, status: WorkOrderStatus) => void;
}) {
  const id = useId();
  // Pausing needs a reason, which is asked for on the job itself.
  const moves = workOrderNextStatuses(item.status, permissions).filter((status) => status !== 'paused');
  return (
    <li className={styles.card}>
      <div className="row between g2">
        <Link className="ref" href={'/app/work-orders/' + item.id}>
          {item.number}
        </Link>
        <PriorityBadge priority={item.priority} />
      </div>
      <Link className="medium" href={'/app/work-orders/' + item.id}>
        {item.title}
      </Link>
      <div className="sm muted">{item.location.name}</div>
      <div className="row between g2">
        <FixSla item={item} now={now} />
        <span className="sm">{item.assigneeName ?? 'Unassigned'}</span>
      </div>
      {moves.length > 0 && (
        <div className="stack g2">
          <label className="sm muted" htmlFor={id}>
            Move {item.number} to
          </label>
          <select
            id={id}
            className={styles.control}
            value=""
            onChange={(event) => event.target.value && onMove(item, event.target.value as WorkOrderStatus)}
          >
            <option value="">Choose a status</option>
            {moves.map((status) => (
              <option key={status} value={status}>
                {WORK_ORDER_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>
      )}
    </li>
  );
}

/**
 * The board. Every card has a menu of the steps this person can take, so the board works without a
 * mouse; the same rules as the job page apply, because the move is made through the same call.
 */
export function WorkOrderBoard({
  items,
  now,
  permissions,
}: {
  items: WorkOrderSummary[];
  now: number;
  permissions: string[];
}) {
  const router = useRouter();
  const clock = useClock(now);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function move(item: WorkOrderSummary, status: WorkOrderStatus) {
    setBusy(true);
    setMessage('');
    try {
      // The board holds the summary, so fetch the current version before changing anything.
      const current = await fetch('/api/work-orders/' + item.id);
      if (!current.ok) throw new Error('Could not load ' + item.number + '.');
      const { version } = (await current.json()) as { version: number };
      await helpdeskWrite('/work-orders/' + item.id + '/status', { version, status });
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not move this work order.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack g3">
      {message && (
        <p role="alert" className="field-error">
          {message}
        </p>
      )}
      <div className={styles.board} role="group" aria-label="Work order board" aria-busy={busy}>
        {LANES.map(({ title, statuses }) => {
          const cards = items.filter(({ status }) => statuses.includes(status));
          return (
            <section key={title} className={styles.lane} aria-label={title}>
              <h2 className={'card-t ' + styles.laneHead}>
                {title}
                <span className="badge">{cards.length}</span>
              </h2>
              {cards.length ? (
                <ul className={styles.cards}>
                  {cards.map((item) => (
                    <Card key={item.id} item={item} now={clock} permissions={permissions} onMove={move} />
                  ))}
                </ul>
              ) : (
                <p className="sm muted">
                  <Icon name="work-order" size={14} /> Nothing here.
                </p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
