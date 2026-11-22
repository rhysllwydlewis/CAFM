'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { GeoJSONSource, GeoJSONSourceSpecification, LngLatBoundsLike, Map } from 'maplibre-gl';
import { Field, TextInput } from '@cafm/ui';
import { LOCATION_STATUSES, type LocationRecord } from '@cafm/shared';
import styles from './locations.module.css';

const route = '/app/locations';
const titleCase = (value: string) => value[0]!.toUpperCase() + value.slice(1);

function mapData(sites: MappedSite[]): GeoJSONSourceSpecification['data'] {
  return {
    type: 'FeatureCollection',
    features: sites.flatMap((site) => {
      const { latitude, longitude } = site.details;
      if (latitude === undefined || longitude === undefined) return [];
      return [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [longitude, Math.max(-85, Math.min(85, latitude))] },
          properties: { id: site.id, status: site.status },
        },
      ];
    }),
  };
}

function visibleBounds(sites: MappedSite[]): LngLatBoundsLike | undefined {
  const coords = sites.flatMap(({ details: { latitude, longitude } }) =>
    latitude === undefined || longitude === undefined
      ? []
      : [[longitude, Math.max(-85, Math.min(85, latitude))] as const],
  );
  if (!coords.length) return;
  const longitudes = coords.map(([longitude]) => longitude);
  const latitudes = coords.map(([, latitude]) => latitude);
  return [
    [Math.min(...longitudes), Math.min(...latitudes)],
    [Math.max(...longitudes), Math.max(...latitudes)],
  ];
}

type MappedSite = Pick<LocationRecord, 'id' | 'status' | 'details'>;

export function MapCanvas({ sites, compact = false }: { sites: MappedSite[]; compact?: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<Map>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const navigate = useRouter();

  useEffect(() => {
    let disposed = false;
    let instance: Map | undefined;
    void import('maplibre-gl')
      .then((library) => {
        if (disposed || !container.current) return;
        const tokens = getComputedStyle(container.current);
        const colour = (name: string) => tokens.getPropertyValue(name).trim();
        const current = new library.Map({
          container: container.current,
          center: [-2.5, 54],
          zoom: 5,
          attributionControl: { compact: false },
          style: {
            version: 8,
            sources: {
              'base-map': {
                type: 'raster',
                tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
                tileSize: 256,
                maxzoom: 19,
                attribution: '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>',
              },
            },
            layers: [
              { id: 'background', type: 'background', paint: { 'background-color': colour('--bg-subtle') } },
              { id: 'base-map', type: 'raster', source: 'base-map' },
            ],
          },
        });
        instance = current;
        map.current = current;
        current.addControl(new library.NavigationControl({ showCompass: false }));
        current.on('error', () => {
          if (!disposed) setError('Some map tiles could not load. You can still use the site list.');
        });
        current.once('style.load', () => {
          if (disposed) return;
          current.addSource('sites', {
            type: 'geojson',
            data: mapData([]),
            cluster: true,
            clusterRadius: 42,
            clusterMaxZoom: 14,
          });
          current.addLayer({
            id: 'clusters',
            type: 'circle',
            source: 'sites',
            filter: ['has', 'point_count'],
            paint: {
              'circle-radius': 17,
              'circle-color': colour('--primary'),
              'circle-stroke-width': 3,
              'circle-stroke-color': colour('--bg-surface'),
            },
          });
          current.addLayer({
            id: 'site-markers',
            type: 'circle',
            source: 'sites',
            filter: ['!', ['has', 'point_count']],
            paint: {
              'circle-radius': 8,
              'circle-color': [
                'match',
                ['get', 'status'],
                'closed',
                colour('--danger'),
                'mothballed',
                colour('--warning'),
                'sold',
                colour('--text-muted'),
                colour('--primary'),
              ],
              'circle-stroke-width': 2,
              'circle-stroke-color': colour('--bg-surface'),
            },
          });
          current.on('click', 'site-markers', (event) => {
            const id = event.features?.[0]?.properties?.id;
            if (typeof id === 'string') navigate.push(route + '?id=' + id);
          });
          current.on('click', 'clusters', (event) => {
            const cluster = event.features?.[0];
            if (!cluster || cluster.geometry.type !== 'Point') return;
            const [longitude, latitude] = cluster.geometry.coordinates;
            if (longitude === undefined || latitude === undefined) return;
            const source = current.getSource<GeoJSONSource>('sites');
            void source
              ?.getClusterExpansionZoom(Number(cluster.properties?.cluster_id))
              .then((zoom) => {
                if (!disposed) current.easeTo({ center: [longitude, latitude], zoom });
              })
              .catch(() => undefined);
          });
          for (const layer of ['clusters', 'site-markers']) {
            current.on('mouseenter', layer, () => {
              current.getCanvas().style.cursor = 'pointer';
            });
            current.on('mouseleave', layer, () => {
              current.getCanvas().style.cursor = '';
            });
          }
          setLoaded(true);
        });
      })
      .catch(() => {
        if (!disposed) setError('The map is unavailable on this device. Use the site list.');
      });
    return () => {
      disposed = true;
      instance?.remove();
      map.current = null;
    };
  }, [navigate]);

  useEffect(() => {
    if (!loaded || !map.current) return;
    const source = map.current.getSource<GeoJSONSource>('sites');
    if (!source) return;
    source.setData(mapData(sites));
    const bounds = visibleBounds(sites);
    if (bounds) map.current.fitBounds(bounds, { padding: 44, maxZoom: 12, duration: 0 });
  }, [loaded, sites]);

  return (
    <section className="card" aria-label="Site map" aria-busy={!loaded && !error}>
      {compact && (
        <header className="card-h">
          <h2 className="card-t">Location</h2>
        </header>
      )}
      <div className={compact ? styles.detailMap : styles.mapCanvas} ref={container} />
      {error && (
        <p className="card-b muted" role="status">
          {error}
        </p>
      )}
    </section>
  );
}

export function PortfolioMap({ sites }: { sites: LocationRecord[] }) {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return sites.filter(
      (site) =>
        (!status || site.status === status) &&
        [site.name, site.code, site.details.address].some((value) => value?.toLowerCase().includes(query)),
    );
  }, [search, sites, status]);

  return (
    <div className={styles.mapLayout}>
      <MapCanvas sites={filtered} />
      <aside className="card" aria-labelledby="map-sites">
        <header className="card-h">
          <h2 id="map-sites" className="card-t">
            Sites
          </h2>
        </header>
        <div className="card-b stack g3">
          <Field label="Filter sites" htmlFor="map-filter">
            <TextInput
              id="map-filter"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </Field>
          <Field label="Site status" htmlFor="map-status">
            <select
              id="map-status"
              className={styles.control}
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">All statuses</option>
              {LOCATION_STATUSES.map((value) => (
                <option value={value} key={value}>
                  {titleCase(value)}
                </option>
              ))}
            </select>
          </Field>
          <p className="muted sm" role="status">
            {filtered.length} {filtered.length === 1 ? 'site' : 'sites'}
          </p>
        </div>
        {filtered.length ? (
          <ul className={styles.siteRows}>
            {filtered.map((site) => (
              <li key={site.id}>
                <Link className="link" href={route + '?id=' + site.id}>
                  {site.name}
                </Link>
                <span className="muted">
                  {titleCase(site.status)}
                  {site.details.latitude === undefined ? ' · No map coordinates' : ''}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="card-b muted">No sites match your filters.</p>
        )}
      </aside>
    </div>
  );
}
