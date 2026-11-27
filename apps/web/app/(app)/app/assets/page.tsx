import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@fmstead/ui';
import {
  ASSET_CONDITIONS,
  ASSET_CRITICALITIES,
  ASSET_SORTS,
  ASSET_STATUSES,
  can,
  feature,
  groupRows,
  parseColumnKeys,
  parseGroup,
  visibleColumns,
  type AssetPage,
  type GroupOption,
  type ListColumn,
  type AssetSummary,
} from '@fmstead/shared';
import { currentUser } from '@/lib/session';
import { ListViewBar } from '@/components/list-view-bar';
import { GroupRows, ListDisplayFields } from '@/components/list-display';
import { BulkSelection, SelectAll, SelectRow } from '@/components/bulk-selection';
import { AssetBulkBar } from './asset-bulk-bar';
import { locationPage } from '../locations/location-data';
import { assetPage, assetSummary } from './asset-data';
import {
  ConditionBadge,
  CriticalityBadge,
  CRITICALITY_LABELS,
  locationLabel,
  route,
  STATUS_LABELS,
  StatusBadge,
  validAssetId,
} from './asset-labels';
import styles from './assets.module.css';

export const metadata: Metadata = { title: 'Assets' };
const SORT_LABELS = { created: 'Date added', number: 'Reference', name: 'Name' } as const;

const ASSET_COLUMNS: ListColumn[] = [
  { key: 'number', label: 'Reference', locked: true },
  { key: 'name', label: 'Asset', locked: true },
  { key: 'model', label: 'Make / model' },
  { key: 'location', label: 'Location' },
  { key: 'condition', label: 'Condition' },
  { key: 'criticality', label: 'Criticality' },
  { key: 'status', label: 'Status' },
];
const ASSET_GROUPS: GroupOption[] = [
  { key: 'condition', label: 'Condition' },
  { key: 'criticality', label: 'Criticality' },
  { key: 'status', label: 'Status' },
  { key: 'location', label: 'Location' },
];
const GROUP_LABELS: Record<string, (asset: AssetPage['items'][number]) => string> = {
  condition: (asset) => 'Condition ' + (asset.condition ?? 'not graded'),
  criticality: (asset) => CRITICALITY_LABELS[asset.criticality] ?? String(asset.criticality),
  status: (asset) => STATUS_LABELS[asset.status] ?? String(asset.status),
  location: (asset) => locationLabel(asset.locationPath),
};

type Query = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => (typeof value === 'string' ? value : undefined);
const pick = <T extends string>(value: string | undefined, allowed: readonly T[]) =>
  allowed.find((item) => item === value);

/** Only values the API accepts go through, so a mistyped link shows the full register rather than an error. */
function filtersFrom(query: Query) {
  const q = one(query.q)?.trim().slice(0, 120);
  const site = one(query.site);
  const after = one(query.after);
  return {
    q: q || undefined,
    group: one(query.group)?.trim().slice(0, 60) || undefined,
    site: validAssetId(site) ? site : undefined,
    status: pick(one(query.status), ASSET_STATUSES),
    condition: pick(one(query.condition), ASSET_CONDITIONS),
    criticality: pick(one(query.criticality), ASSET_CRITICALITIES),
    sort: pick(one(query.sort), ASSET_SORTS) ?? 'created',
    dir: pick(one(query.dir), ['asc', 'desc'] as const),
    after: validAssetId(after) ? after : undefined,
    // How the page is shown. The API never sees these.
    groupby: parseGroup(query.groupby, ASSET_GROUPS),
    cols: parseColumnKeys(query.cols).join(',') || undefined,
  };
}
type Filters = ReturnType<typeof filtersFrom>;

/** The register's own address with some filters changed, keeping the rest. */
function href(filters: Filters, change: Partial<Filters> = {}) {
  const merged = { ...filters, after: undefined, ...change };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `${route}?${text}` : route;
}

function Tile({ label, value, sub, icon }: { label: string; value: string; sub: string; icon: string }) {
  return (
    <div className="card">
      <div className="kpi">
        <span className="kpi-l">
          <Icon name={icon} size={14} />
          {label}
        </span>
        <span className="kpi-v num">{value}</span>
        <span className="kpi-d">{sub}</span>
      </div>
    </div>
  );
}

function Classification({ summary, filters }: { summary: AssetSummary; filters: Filters }) {
  return (
    <section className="card" aria-labelledby="classification-title">
      <header className="card-h">
        <h2 className="card-t" id="classification-title">
          Classification
        </h2>
      </header>
      <div className="card-b">
        <ul className={styles.groupList}>
          <li>
            <Link
              className={styles.groupLink}
              href={href(filters, { group: undefined })}
              aria-current={filters.group ? undefined : 'true'}
            >
              <span>All assets</span>
              <span className="faint num">{summary.total.toLocaleString('en-GB')}</span>
            </Link>
          </li>
          {summary.groups.map(({ group, count }) => (
            <li key={group}>
              <Link
                className={styles.groupLink}
                href={href(filters, { group })}
                aria-current={filters.group === group ? 'true' : undefined}
              >
                <span>{group}</span>
                <span className="faint num">{count.toLocaleString('en-GB')}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Filters({ filters, sites }: { filters: Filters; sites: { id: string; name: string }[] }) {
  const select = (
    name: string,
    label: string,
    value: string | undefined,
    options: readonly { value: string; label: string }[],
    any: string,
  ) => (
    <div className={styles.filter}>
      <label htmlFor={`filter-${name}`}>{label}</label>
      <select id={`filter-${name}`} name={name} defaultValue={value ?? ''} className={styles.control}>
        <option value="">{any}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
  const active = filters.q || filters.site || filters.status || filters.condition || filters.criticality;
  return (
    <form
      key={JSON.stringify(filters)}
      className={styles.filters}
      method="get"
      action={route}
      role="search"
      aria-label="Filter assets"
    >
      {filters.group && <input type="hidden" name="group" value={filters.group} />}
      <div className={styles.filter}>
        <label htmlFor="filter-q">Search</label>
        <input
          id="filter-q"
          type="search"
          name="q"
          defaultValue={filters.q}
          placeholder="Name, reference, serial…"
          className={styles.control}
          maxLength={120}
        />
      </div>
      {sites.length > 0 &&
        select(
          'site',
          'Site',
          filters.site,
          sites.map(({ id, name }) => ({ value: id, label: name })),
          'All sites',
        )}
      {select(
        'condition',
        'Condition',
        filters.condition,
        ASSET_CONDITIONS.map((grade) => ({ value: grade, label: grade })),
        'Any',
      )}
      {select(
        'criticality',
        'Criticality',
        filters.criticality,
        ASSET_CRITICALITIES.map((value) => ({ value, label: CRITICALITY_LABELS[value] })),
        'Any',
      )}
      {select(
        'status',
        'Status',
        filters.status,
        ASSET_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] })),
        'Any',
      )}
      {select(
        'sort',
        'Sort by',
        filters.sort,
        ASSET_SORTS.map((value) => ({ value, label: SORT_LABELS[value] })),
        'Default',
      )}
      {select(
        'dir',
        'Sort order',
        filters.dir,
        [
          { value: 'asc', label: 'Ascending' },
          { value: 'desc', label: 'Descending' },
        ],
        'Default',
      )}
      <ListDisplayFields columns={ASSET_COLUMNS} groups={ASSET_GROUPS} group={filters.groupby} chosen={filters.cols} />
      <button type="submit" className="btn">
        Apply filters
      </button>
      {active && (
        <Link
          className="btn ghost"
          href={href({
            ...filters,
            q: undefined,
            site: undefined,
            status: undefined,
            condition: undefined,
            criticality: undefined,
          })}
        >
          Clear filters
        </Link>
      )}
    </form>
  );
}

function Rows({ page, filters }: { page: AssetPage; filters: Filters }) {
  const bulk = page.canManage;
  const shown = new Set(visibleColumns(ASSET_COLUMNS, filters.cols).map(({ key }) => key));
  const has = (key: string) => shown.has(key);
  const table = (
    <div className={styles.tableWrap}>
      <table className="tbl">
        <thead>
          <tr>
            {bulk && (
              <th scope="col">
                <SelectAll noun="assets" />
              </th>
            )}
            {ASSET_COLUMNS.filter(({ key }) => has(key)).map(({ key, label }) => (
              <th key={key} scope="col">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        {groupRows(page.items, filters.groupby ? GROUP_LABELS[filters.groupby] : undefined).map((section) => (
          <tbody key={section.label}>
            <GroupRows label={section.label} count={section.items.length} span={shown.size + (bulk ? 1 : 0)}>
              {section.items.map((asset) => (
                <tr key={asset.id}>
                  {bulk && (
                    <td>
                      <SelectRow id={asset.id} label={asset.number} />
                    </td>
                  )}
                  <td>
                    <span className="mono">{asset.number}</span>
                  </td>
                  <td>
                    <Link className={styles.assetName} href={`${route}/${asset.id}`}>
                      {asset.name}
                    </Link>
                    {asset.componentCount > 0 && (
                      <small className="faint xs">
                        {asset.componentCount} {asset.componentCount === 1 ? 'component' : 'components'}
                      </small>
                    )}
                  </td>
                  {has('model') && <td className="muted">{[asset.make, asset.model].filter(Boolean).join(' ')}</td>}
                  {has('location') && <td className="muted">{locationLabel(asset.locationPath)}</td>}
                  {has('condition') && (
                    <td>
                      <ConditionBadge condition={asset.condition} />
                    </td>
                  )}
                  {has('criticality') && (
                    <td>
                      <CriticalityBadge criticality={asset.criticality} />
                    </td>
                  )}
                  {has('status') && (
                    <td>
                      <StatusBadge status={asset.status} />
                    </td>
                  )}
                </tr>
              ))}
            </GroupRows>
          </tbody>
        ))}
      </table>
    </div>
  );
  if (!bulk) return table;
  return (
    <BulkSelection items={page.items.map(({ id, number, version }) => ({ id, label: number, version }))}>
      <AssetBulkBar />
      {table}
    </BulkSelection>
  );
}

export default async function AssetsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const [query, user] = await Promise.all([searchParams, currentUser()]);
  if (!can(user, 'assets.read') || !feature(user.entitlements, 'assets')) {
    return (
      <div className="page">
        <div className="page-head">
          <h1 className="page-title">Assets</h1>
        </div>
        <div className="card card-b">
          <p>
            {!can(user, 'assets.read') ? 'Your role doesn’t include Assets.' : 'Assets is unavailable on your plan.'}
          </p>
        </div>
      </div>
    );
  }

  const filters = filtersFrom(query);
  const [summary, page, sites] = await Promise.all([
    assetSummary(),
    assetPage({
      ...(filters.q && { q: filters.q }),
      ...(filters.group && { group: filters.group }),
      ...(filters.site && { locationId: filters.site }),
      ...(filters.status && { status: filters.status }),
      ...(filters.condition && { condition: filters.condition }),
      ...(filters.criticality && { criticality: filters.criticality }),
      sort: filters.sort,
      ...(filters.dir && { dir: filters.dir }),
      ...(filters.after && { after: filters.after }),
    }),
    // The site filter is a convenience: without access to locations the register still works.
    locationPage({ kind: 'site' }).then(
      (sitePage) => sitePage.items.map(({ id, name }) => ({ id, name })),
      () => [],
    ),
  ]);
  const filtered = !!(
    filters.q ||
    filters.group ||
    filters.site ||
    filters.status ||
    filters.condition ||
    filters.criticality
  );
  const share = summary.maintainable ? Math.round((summary.conditionCOrD / summary.maintainable) * 1000) / 10 : 0;

  return (
    <div className="page stack g4">
      <header className={styles.pageHeader}>
        <div>
          <h1 className="page-title">Assets</h1>
          <p className="muted">
            {summary.total.toLocaleString('en-GB')} {summary.total === 1 ? 'asset' : 'assets'} ·{' '}
            {summary.maintainable.toLocaleString('en-GB')} to maintain
          </p>
        </div>
        <div className="row wrap g2">
          <Link className="btn" href={route + '/labels'}>
            <Icon name="qr-code" /> Print labels
          </Link>
          {page.canManage && (
            <Link className="btn primary" href={`${route}/new`}>
              <Icon name="add" /> Add asset
            </Link>
          )}
        </div>
      </header>
      <ListViewBar entity="assets" route="/app/assets" query={query} user={user} />

      <div className={styles.kpis}>
        <Tile
          label="Assets"
          value={summary.total.toLocaleString('en-GB')}
          sub={`${summary.maintainable.toLocaleString('en-GB')} maintainable`}
          icon="asset"
        />
        <Tile
          label="Condition C or D"
          value={summary.conditionCOrD.toLocaleString('en-GB')}
          sub={`${share}% of maintainable`}
          icon="warning"
        />
      </div>

      <div className={styles.registerLayout}>
        <Classification summary={summary} filters={filters} />
        <section className="card" aria-label="Asset register">
          <Filters filters={filters} sites={sites} />
          {page.items.length === 0 ? (
            <div className="card-b stack g2">
              <h2 className="card-t">{filtered ? 'No assets match your filters' : 'No assets yet'}</h2>
              <p className="muted">
                {filtered
                  ? 'Try a different search, or clear the filters.'
                  : page.canManage
                    ? 'Add your first asset to start the register.'
                    : 'Assets in the sites you can access will appear here.'}
              </p>
            </div>
          ) : (
            <Rows page={page} filters={filters} />
          )}
          <footer className={`card-f ${styles.footer}`}>
            <span className="muted" aria-live="polite">
              Showing {page.items.length} {page.items.length === 1 ? 'asset' : 'assets'}
              {filters.group ? ` in ${filters.group}` : ''}
            </span>
            <span className="row g2">
              {filters.after && (
                <Link className="btn sm" href={href(filters)}>
                  Back to the first page
                </Link>
              )}
              {page.nextCursor && (
                <Link className="btn sm" href={href(filters, { after: page.nextCursor })}>
                  Next page
                </Link>
              )}
            </span>
          </footer>
        </section>
      </div>
    </div>
  );
}
