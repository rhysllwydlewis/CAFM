import type { Metadata } from 'next';
import Link from 'next/link';
import {
  can,
  feature,
  listWorkOrdersSchema,
  WORK_ORDER_SORTS,
  WORK_ORDER_STATUS_LABELS,
  WORK_ORDER_STATUSES,
  parseColumnKeys,
  parseGroup,
  type WorkOrderView,
} from '@cafm/shared';
import { Icon } from '@cafm/ui';
import { currentUser } from '@/lib/session';
import { ListViewBar } from '@/components/list-view-bar';
import ModulePage from '../[module]/page';
import { workOrderPage } from '@/lib/work-orders';
import { NewWorkOrder } from './new-work-order';
import { WorkOrderBoard } from './work-order-board';
import { ListDisplayFields } from '@/components/list-display';
import { WORK_ORDER_COLUMNS, WORK_ORDER_GROUPS } from './work-order-columns';
import { WorkOrderTable } from './work-order-table';
import { PRIORITY_LABELS } from './work-order-parts';
import styles from './work-orders.module.css';

export const metadata: Metadata = { title: 'Work orders' };
const SORT_LABELS = { created: 'Date raised', priority: 'Priority', number: 'Number', title: 'Title' } as const;
const views: [WorkOrderView, string][] = [
  ['open', 'Open'],
  ['mine', 'Mine'],
  ['unassigned', 'Unassigned'],
  ['overdue', 'Overdue'],
  ['all', 'All'],
];

export default async function WorkOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await currentUser();
  if (!feature(user.entitlements, 'work_orders') || !can(user, 'work_orders.read')) {
    // The shell already explains a missing role or plan, in the same words for every module.
    return ModulePage({ params: Promise.resolve({ module: 'work-orders' }) });
  }
  const input = await searchParams;
  const board = input.layout === 'board';
  const parsed = listWorkOrdersSchema.safeParse(Object.fromEntries(Object.entries(input).filter(([, value]) => value)));
  const filters = parsed.success ? parsed.data : listWorkOrdersSchema.parse({});
  const params = new URLSearchParams();
  for (const key of ['view', 'status', 'priority', 'q', 'sort', 'dir', 'cursor'] as const) {
    const value = filters[key];
    if (value) params.set(key, String(value));
  }
  // Grouping and columns only change how the page is shown, so the API never sees them.
  const group = parseGroup(input.groupby, WORK_ORDER_GROUPS);
  if (group) params.set('groupby', group);
  const cols = parseColumnKeys(input.cols);
  if (cols.length) params.set('cols', cols.join(','));
  const query = new URLSearchParams(params);
  query.delete('groupby');
  query.delete('cols');
  if (board) {
    // The board shows what is still open, all in one go.
    query.delete('cursor');
    query.set('limit', '100');
  }
  const data = await workOrderPage(query.toString());
  const currentView = filters.view;
  const stats = data.counts;
  const canCreate = can(user, 'work_orders.edit');
  // The layout is part of where a page returns to, so closing the new-job form keeps the board.
  const here = new URLSearchParams(params);
  if (board) here.set('layout', 'board');
  const layoutParams = (layout: 'list' | 'board') => {
    const next = new URLSearchParams(params);
    next.delete('cursor');
    if (layout === 'board') next.set('layout', 'board');
    return '/app/work-orders?' + next.toString();
  };
  const viewHref = (view: WorkOrderView) => {
    const next = new URLSearchParams(params);
    next.set('view', view);
    next.delete('cursor');
    if (board) next.set('layout', 'board');
    return '/app/work-orders?' + next.toString();
  };
  if (data.cursorReset) params.delete('cursor');
  const next = new URLSearchParams(params);
  if (data.nextCursor) next.set('cursor', data.nextCursor);
  const cards = stats
    ? ([
        ['Open', stats.open, 'work-order'],
        ['Unassigned', stats.unassigned, 'helpdesk'],
        ['Overdue', stats.overdue, 'sla'],
        ['Completed today', stats.completedToday, 'approve'],
      ] as const)
    : [];

  return (
    <div className="page stack g4">
      <div className="page-head">
        <div>
          <h1 className="page-title">Work orders</h1>
          {stats && (
            <p className="page-sub">
              {stats.open} open · {stats.overdue} overdue
            </p>
          )}
        </div>
        <div className={'page-actions ' + styles.actions}>
          {canCreate && (
            <Link
              id="new-work-order-trigger"
              href={'/app/work-orders?' + new URLSearchParams([...here, ['new', '1']]).toString()}
              className="btn primary"
            >
              <Icon name="add" /> New work order
            </Link>
          )}
        </div>
      </div>
      <ListViewBar entity="work_orders" route="/app/work-orders" query={input} user={user} />
      {cards.length > 0 && (
        <div className={styles.metrics}>
          {cards.map(([label, value, icon]) => (
            <section className="card card-b stack g2" key={label}>
              <div className="row g2 muted">
                <Icon name={icon} />
                {label}
              </div>
              <strong className="page-title">{value}</strong>
            </section>
          ))}
        </div>
      )}
      <section className="card">
        <nav aria-label="Work order views" className={styles.filters}>
          {views.map(([view, label]) => (
            <Link
              key={view}
              className={'btn sm ' + (view === currentView ? 'primary' : 'ghost')}
              aria-current={view === currentView ? 'page' : undefined}
              href={viewHref(view)}
            >
              {label}
            </Link>
          ))}
          <span className="grow" />
          <Link
            className={'btn sm ' + (board ? 'ghost' : 'primary')}
            aria-current={board ? undefined : 'page'}
            href={layoutParams('list')}
          >
            List
          </Link>
          <Link
            className={'btn sm ' + (board ? 'primary' : 'ghost')}
            aria-current={board ? 'page' : undefined}
            href={layoutParams('board')}
          >
            Board
          </Link>
        </nav>
        <form key={params.toString()} className={styles.filters}>
          <input type="hidden" name="view" value={currentView} />
          {board && <input type="hidden" name="layout" value="board" />}
          <label className="field">
            <span className="label">Search work orders</span>
            <input className={styles.control} type="search" name="q" defaultValue={filters.q} />
          </label>
          <label className="field">
            <span className="label">Priority</span>
            <select className={styles.control} name="priority" defaultValue={filters.priority ?? ''}>
              <option value="">All priorities</option>
              {PRIORITY_LABELS.map((label, index) => (
                <option key={label} value={index + 1}>
                  P{index + 1} {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Status</span>
            <select className={styles.control} name="status" defaultValue={filters.status ?? ''}>
              <option value="">All statuses</option>
              {WORK_ORDER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {WORK_ORDER_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Sort by</span>
            <select className={styles.control} name="sort" defaultValue={filters.sort}>
              {WORK_ORDER_SORTS.map((sort) => (
                <option key={sort} value={sort}>
                  {SORT_LABELS[sort]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Sort order</span>
            <select className={styles.control} name="dir" defaultValue={filters.dir ?? ''}>
              <option value="">Default</option>
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </label>
          {!board && (
            <ListDisplayFields
              columns={WORK_ORDER_COLUMNS}
              groups={WORK_ORDER_GROUPS}
              group={group}
              chosen={input.cols}
            />
          )}
          <button type="submit" className="btn">
            Apply filters
          </button>
        </form>
        {data.cursorReset && <p className="card-b muted">The list changed. Showing the first page.</p>}
        {board ? (
          <div className="card-b">
            <WorkOrderBoard items={data.items} now={Date.now()} permissions={user.permissions} />
            {data.nextCursor && <p className="sm muted">Showing the first 100. Use the list to see the rest.</p>}
          </div>
        ) : (
          <WorkOrderTable items={data.items} now={Date.now()} columns={input.cols} group={group} />
        )}
        {!board && (data.nextCursor || params.has('cursor')) && (
          <div className="card-b row g2">
            {params.has('cursor') && (
              <Link className="btn" href={viewHref(currentView)}>
                First page
              </Link>
            )}
            {data.nextCursor && (
              <Link className="btn" href={'/app/work-orders?' + next.toString()}>
                Next page
              </Link>
            )}
          </div>
        )}
      </section>
      {canCreate && input.new === '1' && (
        <NewWorkOrder canAssign={can(user, 'work_orders.assign')} returnTo={'/app/work-orders?' + here.toString()} />
      )}
    </div>
  );
}
