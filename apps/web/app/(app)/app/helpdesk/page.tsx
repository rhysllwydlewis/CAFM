import type { Metadata } from 'next';
import Link from 'next/link';
import { can, feature, listRequestsSchema, REQUEST_CHANNEL_LABELS, type RequestView } from '@cafm/shared';
import { Icon } from '@cafm/ui';
import { currentUser } from '@/lib/session';
import { catalogue, readHelpdesk, requestPage } from '@/lib/helpdesk';
import { RequestForm } from './request-form';
import { RequestTable } from './request-table';
import styles from './helpdesk.module.css';

export const metadata: Metadata = { title: 'Helpdesk' };
const views: [RequestView, string][] = [
  ['open', 'Open'],
  ['mine', 'Mine'],
  ['unassigned', 'Unassigned'],
  ['at_risk', 'At risk'],
  ['all', 'All'],
];

export default async function HelpdeskPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await currentUser();
  if (!feature(user.entitlements, 'helpdesk') || !can(user, 'requests.read')) {
    return (
      <div className="page">
        <h1 className="page-title">Helpdesk</h1>
        <div className="card empty">
          <Icon name="locked" size={24} />
          <p>
            {feature(user.entitlements, 'helpdesk')
              ? 'Your role doesn’t include the Helpdesk queue.'
              : 'Helpdesk is locked for this organisation.'}
          </p>
          {can(user, 'requests.create') && feature(user.entitlements, 'helpdesk') && (
            <Link href="/portal" className="btn">
              My requests
            </Link>
          )}
        </div>
      </div>
    );
  }
  const input = await searchParams;
  const parsed = listRequestsSchema.safeParse(Object.fromEntries(Object.entries(input).filter(([, value]) => value)));
  const filters = parsed.success ? parsed.data : listRequestsSchema.parse({});
  const params = new URLSearchParams();
  for (const key of ['view', 'q', 'locationId', 'category', 'channel', 'cursor'] as const) {
    if (filters[key]) params.set(key, filters[key]);
  }
  const operator = can(user, 'requests.create') && can(user, 'requests.manage');
  const [data, types, sites] = await Promise.all([
    requestPage('requests', '?' + params.toString()),
    can(user, 'requests.create') ? catalogue() : null,
    can(user, 'requests.create') ? readHelpdesk<{ id: string; name: string; code: string }[]>('/locations') : [],
  ]);
  const currentView = filters.view;
  const stats = data.counts;
  const cards = stats
    ? [
        ['New (unassigned)', stats.unassigned, 'helpdesk'],
        ['At risk of breach', stats.atRisk, 'sla'],
        ['Logged today', stats.loggedToday, 'add'],
        ['First response (7 days)', stats.responseMinutes === null ? '—' : stats.responseMinutes + ' min', 'clock'],
        ['CSAT (7 days)', stats.rating === null ? '—' : stats.rating.toFixed(1) + ' / 5', 'approve'],
      ]
    : [];
  const viewHref = (view: RequestView) => {
    const next = new URLSearchParams(params);
    next.set('view', view);
    next.delete('cursor');
    return '/app/helpdesk?' + next.toString();
  };
  const next = new URLSearchParams(params);
  if (data.nextCursor) next.set('cursor', data.nextCursor);
  const categories = [...new Set(types?.types.map(({ category }) => category) ?? [])];

  return (
    <div className="page stack g4">
      <div className="page-head">
        <div>
          <h1 className="page-title">Helpdesk</h1>
          {stats && (
            <p className="page-sub">
              {stats.open} open requests · {stats.atRisk} at risk of SLA breach
            </p>
          )}
        </div>
        <div className={styles.actions}>
          {can(user, 'settings.manage') && (
            <Link href="/app/helpdesk/settings" className="btn">
              <Icon name="settings" /> Request catalogue
            </Link>
          )}
          {operator && (
            <Link
              id="quick-log-trigger"
              href={'/app/helpdesk?' + new URLSearchParams([...params, ['log', '1']]).toString()}
              className="btn primary"
            >
              <Icon name="add" /> Log request
            </Link>
          )}
        </div>
      </div>
      {cards.length > 0 && (
        <div className={styles.metrics}>
          {cards.map(([label, value, icon]) => (
            <section className="card card-b stack g2" key={label}>
              <div className="row g2 muted">
                <Icon name={String(icon)} />
                {label}
              </div>
              <strong className="page-title">{value}</strong>
            </section>
          ))}
        </div>
      )}
      <section className="card">
        <nav aria-label="Queue views" className={styles.filters}>
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
        </nav>
        <form className={styles.filters}>
          <input type="hidden" name="view" value={currentView} />
          <label className="field">
            <span className="label">Search requests</span>
            <input className={styles.control} type="search" name="q" defaultValue={filters.q} />
          </label>
          {sites.length > 0 && (
            <label className="field">
              <span className="label">Location</span>
              <select className={styles.control} name="locationId" defaultValue={filters.locationId ?? ''}>
                <option value="">All locations</option>
                {sites.map((site) => (
                  <option value={site.id} key={site.id}>
                    {site.name} · {site.code}
                  </option>
                ))}
              </select>
            </label>
          )}
          {categories.length > 0 && (
            <label className="field">
              <span className="label">Category</span>
              <select className={styles.control} name="category" defaultValue={filters.category ?? ''}>
                <option value="">All categories</option>
                {categories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            <span className="label">Channel</span>
            <select className={styles.control} name="channel" defaultValue={filters.channel ?? ''}>
              <option value="">All channels</option>
              {Object.entries(REQUEST_CHANNEL_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn">
            Apply filters
          </button>
        </form>
        <RequestTable items={data.items} now={Date.now()} />
        {(data.nextCursor || filters.cursor) && (
          <div className="card-b row g2">
            {filters.cursor && (
              <Link className="btn" href={viewHref(currentView)}>
                First page
              </Link>
            )}
            {data.nextCursor && (
              <Link className="btn" href={'/app/helpdesk?' + next.toString()}>
                Next page
              </Link>
            )}
          </div>
        )}
      </section>
      {operator && input.log === '1' && types && (
        <RequestForm staff data={types} returnTo={'/app/helpdesk?' + params.toString()} />
      )}
    </div>
  );
}
