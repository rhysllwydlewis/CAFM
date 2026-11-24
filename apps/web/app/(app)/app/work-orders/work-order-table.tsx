'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@cafm/ui';
import { formatMinor, groupRows, visibleColumns, WORK_ORDER_STATUS_LABELS, type WorkOrderSummary } from '@cafm/shared';
import { WORK_ORDER_COLUMNS } from './work-order-columns';
import { GroupRows } from '@/components/list-display';
import { FixSla, PRIORITY_LABELS, PriorityBadge, StatusBadge } from './work-order-parts';
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

const GROUP_LABELS: Record<string, (item: WorkOrderSummary) => string> = {
  status: (item) => WORK_ORDER_STATUS_LABELS[item.status] ?? item.status,
  priority: (item) => 'P' + item.priority + ' ' + (PRIORITY_LABELS[item.priority - 1] ?? ''),
  assignee: (item) => item.assigneeName ?? 'Unassigned',
  location: (item) => item.location.name + ' · ' + item.location.code,
};

export function WorkOrderTable({
  items,
  now,
  columns: chosen,
  group,
}: {
  items: WorkOrderSummary[];
  now: number;
  /** The `cols` value from the address. */
  columns?: string | string[];
  group?: string;
}) {
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
  const shown = new Set(visibleColumns(WORK_ORDER_COLUMNS, chosen).map(({ key }) => key));
  const has = (key: string) => shown.has(key);
  const span = shown.size + (showCost ? 1 : 0);
  return (
    <div className={styles.tableWrap} role="region" aria-label="Work order results" tabIndex={0}>
      <table className="tbl">
        <thead>
          <tr>
            {[
              ...WORK_ORDER_COLUMNS.filter(({ key }) => has(key)).map(({ label }) => label),
              ...(showCost ? ['Cost'] : []),
            ].map((label) => (
              <th key={label} scope="col">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groupRows(items, group ? GROUP_LABELS[group] : undefined).map((section) => (
            <GroupRows key={section.label} label={section.label} count={section.items.length} span={span}>
              {section.items.map((item) => (
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
                  {has('priority') && (
                    <td>
                      <PriorityBadge priority={item.priority} />
                    </td>
                  )}
                  {has('status') && (
                    <td>
                      <StatusBadge item={item} />
                    </td>
                  )}
                  {has('assignee') && <td>{item.assigneeName ?? 'Unassigned'}</td>}
                  {has('sla') && (
                    <td>
                      <FixSla item={item} now={clock} />
                    </td>
                  )}
                  {showCost && <td>{formatMinor(item.costTotalMinor ?? 0, item.currency)}</td>}
                </tr>
              ))}
            </GroupRows>
          ))}
        </tbody>
      </table>
    </div>
  );
}
