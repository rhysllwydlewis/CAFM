import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Icon } from '@cafm/ui';
import { can, feature } from '@cafm/shared';
import { currentUser } from '@/lib/session';
import {
  allLocations,
  locationCustomFields,
  locationDetail,
  locationPage,
  route,
  validLocationId,
} from './location-data';
import { LocationBrowser } from './location-browser';
import { CalendarForm, LocationForm } from './location-forms';
import { LocationProfile } from './location-profile';
import { PortfolioMap } from './portfolio-map';
import styles from './locations.module.css';

export const metadata: Metadata = { title: 'Locations' };
type Query = { id?: string; q?: string; mode?: string; view?: string };

export default async function LocationsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const [{ id, q, mode, view }, user] = await Promise.all([searchParams, currentUser()]);
  if (!can(user, 'locations.read') || !feature(user.entitlements, 'locations'))
    return (
      <div className="page">
        <div className="page-head">
          <h1 className="page-title">Locations</h1>
        </div>
        <div className="card card-b">
          <p>
            {!can(user, 'locations.read')
              ? 'Your role doesn’t include Locations.'
              : 'Locations is unavailable on your plan.'}
          </p>
        </div>
      </div>
    );

  if (view === 'map') {
    const [sites, roots] = await Promise.all([
      allLocations({ kind: 'site' }),
      locationPage({ parent: 'root', limit: '1' }),
    ]);
    return (
      <div className="page stack g4">
        <header className={styles.pageHeader}>
          <h1 className="page-title">Portfolio map</h1>
          <div className="row wrap g2">
            <Link className="btn" href={route}>
              Hierarchy
            </Link>
            {roots.canManageHierarchy && (
              <Link className="btn primary" href={route + '?mode=add'}>
                Add site
              </Link>
            )}
          </div>
        </header>
        <PortfolioMap sites={sites} />
      </div>
    );
  }

  const search = typeof q === 'string' ? q.trim().slice(0, 120) : '';
  if (id !== undefined && !validLocationId(id)) notFound();
  const [tree, detail, sites] = await Promise.all([
    locationPage(search ? { q: search } : { parent: 'root' }),
    id ? locationDetail(id) : Promise.resolve(null),
    id || search || mode === 'add' ? Promise.resolve(null) : locationPage({ kind: 'site' }),
  ]);
  if (id && !detail) notFound();
  const suggested = search
    ? tree.items[0]
    : ((user.tenant.demo ? sites?.items.find((item) => item.code === 'CDF') : undefined) ?? sites?.items[0]);
  const selected = detail ?? (suggested && mode !== 'add' ? await locationDetail(suggested.id) : null);
  const canManage = can(user, 'locations.manage');
  const canMove = tree.canManageHierarchy;
  const editing = !!selected && mode === 'edit' && canManage;
  const adding = mode === 'add' && canManage && (canMove || !!selected);
  const calendar = !!selected && selected.kind === 'site' && mode === 'calendar' && canManage;
  const [children, parents, customFields] = await Promise.all([
    selected && !editing && !adding && !calendar ? locationPage({ parent: selected.id }) : Promise.resolve(null),
    (editing || adding) && canMove ? allLocations() : Promise.resolve([]),
    editing || adding || (selected && Object.keys(selected.custom).length > 0)
      ? locationCustomFields()
      : Promise.resolve([]),
  ]);

  return (
    <div className="page stack g4">
      <header className={styles.pageHeader}>
        <div>
          {selected && (
            <p className="eyebrow">
              {selected.code + (selected.details.address ? ' · ' + selected.details.address : '')}
            </p>
          )}
          <h1 className="page-title">{selected?.name ?? 'Locations'}</h1>
        </div>
        <div className="row wrap g2">
          <Link className="btn" href={route + '?view=map'}>
            <Icon name="map" /> Portfolio map
          </Link>
          {selected && (
            <Link className="btn" href={route + '/labels?id=' + selected.id}>
              <Icon name="qr-code" /> QR labels
            </Link>
          )}
          {selected && canManage && (
            <Link className="btn primary" href={route + '?id=' + selected.id + '&mode=edit'}>
              <Icon name="edit" /> Edit {selected.kind === 'site' ? 'site' : 'location'}
            </Link>
          )}
          {canMove && (
            <Link className="btn" href={route + '?mode=add'}>
              Add site
            </Link>
          )}
          {selected && canManage && !['portfolio', 'region'].includes(selected.kind) && (
            <Link className="btn" href={route + '?id=' + selected.id + '&mode=add'}>
              Add child location
            </Link>
          )}
        </div>
      </header>
      <div className={styles.hierarchyLayout}>
        <LocationBrowser key={mode ? 'form' : 'browse'} initial={tree} search={search} selectedId={selected?.id} />
        {editing && selected ? (
          <LocationForm
            key={'edit-' + selected.id}
            location={selected}
            parents={parents}
            customFields={customFields}
            canMove={canMove}
          />
        ) : adding ? (
          <LocationForm
            key={'add-' + (selected?.id ?? 'root')}
            parent={selected ?? undefined}
            parents={parents}
            customFields={customFields}
            canMove={canMove}
          />
        ) : calendar && selected ? (
          <CalendarForm key={selected.id} location={selected} />
        ) : selected && children ? (
          <LocationProfile location={selected} children={children} customFields={customFields} canManage={canManage} />
        ) : (
          <section className="card card-b">
            <h2>Choose a location</h2>
            <p className="muted">Use the hierarchy or search by name or code.</p>
          </section>
        )}
      </div>
    </div>
  );
}
