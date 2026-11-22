'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@cafm/ui';
import { formatMinor, type WorkOrderSummary } from '@cafm/shared';
import { FixSla, PriorityBadge, StatusBadge } from './work-order-parts';
import styles from './work-orders.module.css';

/** Keeps the SLA column honest while the page stays open. */
export function useClock(now: number) {
  const [clock, setClock] = useState(now);
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, [now]);
  return clock;
}

export function WorkOrderTable({ items, now }: { items: WorkOrderSummary[]; now: number }) {
  const clock = useClock(now);
  // The cost column is there only for people who may see costs.
  const showCost = items.some(({ costTotalMinor }) => costTotalMinor !== undefined);
  if (!items.length)
    return (
      <div className="empty">
        <Icon name="work-order" size={24} />
        <p>No work orders match this view.</p>
      </div>
    );
  return (
    <div className={styles.tableWrap} role="region" aria-label="Work order results" tabIndex={0}>
      <table className="tbl">
        <thead>
          <tr>
            {[
              'Ref',
              'Title and location',
              'Priority',
              'Status',
              'Assigned to',
              'SLA (fix)',
              ...(showCost ? ['Cost'] : []),
            ].map((label) => (
              <th key={label} scope="col">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>
                <Link className="ref" href={'/app/work-orders/' + item.id}>
                  {item.number}
                </Link>
              </td>
              <td>
                <Link className="medium" href={'/app/work-orders/' + item.id}>
                  {item.title}
                </Link>
                <div className="sm muted">
                  {item.location.name} · {item.location.code}
                  {item.asset ? ' · ' + item.asset.name : ''}
                </div>
              </td>
              <td>
                <PriorityBadge priority={item.priority} />
              </td>
              <td>
                <StatusBadge item={item} />
              </td>
              <td>{item.assigneeName ?? 'Unassigned'}</td>
              <td>
                <FixSla item={item} now={clock} />
              </td>
              {showCost && <td>{formatMinor(item.costTotalMinor ?? 0, item.currency)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
