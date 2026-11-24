import Link from 'next/link';
import { Icon } from '@cafm/ui';
import { REQUEST_STATUS_LABELS, type RequestStatus as Status, type RequestSummary } from '@cafm/shared';
import { PriorityBadge } from '../work-orders/work-order-parts';
import { RequestSla } from './request-table';
import styles from './helpdesk.module.css';

const LANES: { title: string; statuses: Status[] }[] = [
  { title: 'New', statuses: ['new'] },
  { title: 'Assigned', statuses: ['assigned'] },
  { title: 'In progress', statuses: ['in_progress'] },
  { title: 'Completed', statuses: ['completed'] },
  { title: 'Closed or rejected', statuses: ['closed', 'rejected', 'merged'] },
];

/**
 * The requests board: one lane for each stage of a request. It is for reading the queue at a glance. A request
 * changes stage on its own page, where a rejection can be explained, or through the bulk actions on the list.
 */
export function RequestBoard({ items, now }: { items: RequestSummary[]; now: number }) {
  return (
    <div className={styles.board} role="group" aria-label="Request board">
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
                  <li key={item.id} className={styles.card}>
                    <div className="row between g2">
                      <Link className="ref" href={'/app/helpdesk/' + item.id}>
                        {item.number}
                      </Link>
                      <PriorityBadge priority={item.priority} />
                    </div>
                    <Link className="medium" href={'/app/helpdesk/' + item.id}>
                      {item.title}
                    </Link>
                    <div className="sm muted">{item.location.name}</div>
                    <div className="row between g2">
                      <RequestSla item={item} now={now} />
                      <span className="sm">{item.assigneeName ?? 'Unassigned'}</span>
                    </div>
                    {statuses.length > 1 && <span className="sm muted">{REQUEST_STATUS_LABELS[item.status]}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="sm muted">
                <Icon name="helpdesk" size={14} /> Nothing here.
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
