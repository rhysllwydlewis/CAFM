import { Fragment, type ReactNode } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Icon } from '@cafm/ui';
import { can, feature, type AssetClassRecord, type AssetImpact, type AssetServesRecord } from '@cafm/shared';
import { currentUser } from '@/lib/session';
import { customFieldValue } from '../../locations/location-custom-fields';
import { AssetForm } from '../asset-form';
import { ServesEditor } from '../serves-editor';
import {
  assetClasses,
  assetCustomFields,
  assetDetail,
  assetImpact,
  assetPage,
  assetServes,
  type AssetDetail,
} from '../asset-data';
import {
  ConditionBadge,
  CriticalityBadge,
  formatDate,
  formatMoney,
  locationLabel,
  route,
  StatusBadge,
  validAssetId,
} from '../asset-labels';
import styles from '../assets.module.css';

type Params = { id: string };
type Query = { mode?: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params;
  const asset = validAssetId(id) ? await assetDetail(id).catch(() => null) : null;
  return { title: asset?.name ?? 'Asset' };
}

/** Age against expected life, from the install date. */
function lifecycle(asset: AssetDetail, now = new Date()) {
  if (!asset.installedOn || !asset.expectedLifeYears) return null;
  const installed = new Date(asset.installedOn + 'T00:00:00Z');
  const age = (now.getTime() - installed.getTime()) / (365.25 * 24 * 3600 * 1000);
  const percent = Math.max(0, Math.min(100, Math.round((age / asset.expectedLifeYears) * 100)));
  return {
    age: Math.max(0, Math.floor(age)),
    percent,
    tone: percent >= 100 ? 'danger' : percent >= 80 ? 'warning' : '',
    endYear: installed.getUTCFullYear() + asset.expectedLifeYears,
  };
}

function Rows({ rows }: { rows: readonly (readonly [string, ReactNode])[] }) {
  const shown = rows.filter(([, value]) => value !== '' && value != null && value !== false);
  if (!shown.length) return <p className="muted">Nothing entered yet.</p>;
  return (
    <dl className="kv">
      {shown.map(([label, value]) => (
        <Fragment key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

function attributeValue(attribute: AssetDetail['classAttributes'][number], value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (attribute.type === 'picklist') return attribute.options?.find((o) => o.value === value)?.label ?? String(value);
  if (attribute.type === 'date') return formatDate(String(value));
  return attribute.unit ? `${value} ${attribute.unit}` : String(value);
}

function ServesCard({ serves, impact }: { serves: AssetServesRecord; impact: AssetImpact | null }) {
  const none = !serves.locations.length && !serves.assets.length && !serves.servedBy.length;
  const places = impact?.locations.length ?? 0;
  const dependants = impact?.assets.length ?? 0;
  return (
    <section className="card" aria-labelledby="serves-title">
      <header className="card-h">
        <h2 className="card-t" id="serves-title">
          Serves
        </h2>
      </header>
      <div className="card-b stack g3">
        {none && <p className="muted">This asset doesn’t serve anything, and nothing serves it.</p>}
        {serves.locations.length > 0 && (
          <div>
            <p className="muted">Places</p>
            <ul className={styles.componentList}>
              {serves.locations.map((location) => (
                <li key={location.id}>
                  <Link className="link" href={`/app/locations?id=${location.id}`}>
                    {locationLabel(location.path)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        {serves.assets.length > 0 && (
          <div>
            <p className="muted">Assets</p>
            <ul className={styles.componentList}>
              {serves.assets.map((served) => (
                <li key={served.id}>
                  <Link className="link" href={`${route}/${served.id}`}>
                    {served.name}
                  </Link>
                  <span className="mono muted">{served.number}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {serves.servedBy.length > 0 && (
          <div>
            <p className="muted">Served by</p>
            <ul className={styles.componentList}>
              {serves.servedBy.map((source) => (
                <li key={source.id}>
                  <Link className="link" href={`${route}/${source.id}`}>
                    {source.name}
                  </Link>
                  <span className="mono muted">{source.number}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {impact && (places > 0 || dependants > 0) && (
          <p className="sm">
            If this is out of service, {dependants} {dependants === 1 ? 'asset' : 'assets'} and {places}{' '}
            {places === 1 ? 'place' : 'places'} are affected.
          </p>
        )}
      </div>
    </section>
  );
}

export default async function AssetPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Query>;
}) {
  const [{ id }, { mode }, user] = await Promise.all([params, searchParams, currentUser()]);
  if (!validAssetId(id)) notFound();
  if (!can(user, 'assets.read') || !feature(user.entitlements, 'assets')) {
    return (
      <div className="page">
        <div className="card card-b">
          <p>
            {!can(user, 'assets.read') ? 'Your role doesn’t include Assets.' : 'Assets is unavailable on your plan.'}
          </p>
        </div>
      </div>
    );
  }
  const asset = await assetDetail(id);
  if (!asset) notFound();
  const canManage = can(user, 'assets.manage');
  const editing = mode === 'edit' && canManage;
  const editingServes = mode === 'serves' && canManage;
  const [classes, customFields, components, serves, impact] = await Promise.all([
    editing ? assetClasses() : Promise.resolve([] as AssetClassRecord[]),
    assetCustomFields(),
    editing ? Promise.resolve(null) : assetPage({ parent: asset.id, limit: '100' }),
    editing ? Promise.resolve(null) : assetServes(asset.id),
    editing || editingServes ? Promise.resolve(null) : assetImpact(asset.id),
  ]);
  // The asset's own class stays selectable even if it has been retired since.
  if (editing && asset.classId && !classes.some((item) => item.id === asset.classId)) {
    classes.push({
      id: asset.classId,
      scheme: 'custom',
      code: '',
      name: asset.className ?? 'Retired class',
      group: asset.classGroup ?? 'Retired',
      attributes: asset.classAttributes,
      position: 0,
      active: false,
    });
  }
  const cycle = lifecycle(asset);
  const overview = [
    ['Make', asset.make],
    ['Model', asset.model],
    ['Serial', asset.serial],
    ...asset.classAttributes.map(
      (attribute) => [attribute.label, attributeValue(attribute, asset.attributes[attribute.key])] as const,
    ),
    ['Installed', formatDate(asset.installedOn)],
    [
      'Expected life',
      asset.expectedLifeYears ? `${asset.expectedLifeYears} years${cycle ? ` (to ${cycle.endYear})` : ''}` : '',
    ],
    ['Replacement cost', formatMoney(asset.replacementCost)],
  ] as const;
  const placement = [
    [
      'Site',
      asset.site && (
        <Link className="link" href={`/app/locations?id=${asset.locationId}`}>
          {asset.site.name}
        </Link>
      ),
    ],
    ['Location', locationLabel(asset.locationPath)],
    [
      'Part of',
      asset.parent && (
        <Link className="link" href={`${route}/${asset.parent.id}`}>
          {asset.parent.name}
        </Link>
      ),
    ],
    ['Supplier', asset.supplier],
    ...customFields.map((field) => [field.label, customFieldValue(field, asset.custom[field.key])] as const),
  ] as const;

  return (
    <div className="page stack g4">
      <header className={styles.pageHeader}>
        <div>
          <p className="eyebrow">
            <span className="mono">{asset.number}</span>
            {asset.className && <span> · {asset.className}</span>}
          </p>
          <h1 className="page-title">{asset.name}</h1>
        </div>
        <div className="row wrap g2">
          <Link className="btn" href={route}>
            <Icon name="asset" /> All assets
          </Link>
          {!editing &&
            !editingServes &&
            asset.status !== 'decommissioned' &&
            can(user, 'requests.create') &&
            feature(user.entitlements, 'helpdesk') && (
              <Link className="btn" href={'/portal/new?asset=' + asset.id + '&source=register'}>
                <Icon name="helpdesk" /> Report a fault
              </Link>
            )}
          {canManage && !editing && !editingServes && (
            <>
              <Link className="btn" href={`${route}/${asset.id}?mode=serves`}>
                <Icon name="link" /> Edit what it serves
              </Link>
              <Link className="btn" href={`${route}/new?parent=${asset.id}`}>
                <Icon name="add" /> Add component
              </Link>
              <Link className="btn primary" href={`${route}/${asset.id}?mode=edit`}>
                <Icon name="edit" /> Edit
              </Link>
            </>
          )}
        </div>
      </header>
      <div className="row wrap g2">
        <StatusBadge status={asset.status} />
        <ConditionBadge condition={asset.condition} verbose />
        <CriticalityBadge criticality={asset.criticality} verbose />
      </div>

      {editing ? (
        <AssetForm asset={asset} classes={classes} customFields={customFields} />
      ) : editingServes && serves ? (
        <ServesEditor asset={asset} siteId={asset.site?.id ?? null} initial={serves} />
      ) : (
        <div className={styles.detailLayout}>
          <div className="stack g4">
            <section className="card" aria-labelledby="overview-title">
              <header className="card-h">
                <h2 className="card-t" id="overview-title">
                  Overview
                </h2>
              </header>
              <div className={`card-b ${styles.formGrid}`}>
                <Rows rows={overview} />
                <Rows rows={placement} />
              </div>
            </section>
            <section className="card" aria-labelledby="components-title">
              <header className="card-h">
                <h2 className="card-t" id="components-title">
                  Components
                </h2>
              </header>
              <div className="card-b">
                {components && components.items.length > 0 ? (
                  <ul className={styles.componentList}>
                    {components.items.map((component) => (
                      <li key={component.id}>
                        <span>
                          <Link className="link" href={`${route}/${component.id}`}>
                            {component.name}
                          </Link>{' '}
                          <span className="mono muted">{component.number}</span>
                        </span>
                        <StatusBadge status={component.status} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">This asset has no components.</p>
                )}
              </div>
            </section>
          </div>
          <section className="card" aria-labelledby="lifecycle-title">
            <header className="card-h">
              <h2 className="card-t" id="lifecycle-title">
                Lifecycle
              </h2>
            </header>
            <div className="card-b stack g3">
              {cycle ? (
                <>
                  <div className="row between sm">
                    <span className="muted">
                      Age {cycle.age} of {asset.expectedLifeYears} years
                    </span>
                    <span className="medium">{cycle.percent}%</span>
                  </div>
                  <div
                    className={`bar ${cycle.tone}`}
                    role="progressbar"
                    aria-label="Share of expected life used"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={cycle.percent}
                  >
                    <i style={{ width: `${cycle.percent}%` }} />
                  </div>
                  <div className="row between sm">
                    <span className="muted">Expected end of life</span>
                    <span className="medium">{cycle.endYear}</span>
                  </div>
                </>
              ) : (
                <p className="muted">Add the install date and expected life to see how much of its life is used.</p>
              )}
              {asset.replacementCost && (
                <div className="row between sm">
                  <span className="muted">Replacement cost</span>
                  <span className="medium">{formatMoney(asset.replacementCost)}</span>
                </div>
              )}
            </div>
          </section>
          {serves && <ServesCard serves={serves} impact={impact} />}
        </div>
      )}
    </div>
  );
}
