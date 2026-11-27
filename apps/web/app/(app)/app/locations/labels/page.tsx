import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { can, feature } from '@fmstead/shared';
import { configuredAppUrl } from '@/lib/public-url';
import { currentUser } from '@/lib/session';
import { allLocations, locationDetail, route, validLocationId } from '../location-data';
import styles from '../locations.module.css';
import { LabelSheet } from './label-sheet';

export const metadata: Metadata = { title: 'Location QR labels' };

export default async function LabelsPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const [{ id }, user] = await Promise.all([searchParams, currentUser()]);
  if (!can(user, 'locations.read') || !feature(user.entitlements, 'locations')) redirect(route);
  if (!validLocationId(id)) notFound();
  const [location, records] = await Promise.all([locationDetail(id), allLocations()]);
  if (!location) notFound();
  const locations = [
    location,
    ...records.filter((record) => record.id !== location.id).sort((a, b) => a.name.localeCompare(b.name)),
  ].map(({ id, name, code }) => ({ id, name, code }));
  return (
    <div className="page stack g4">
      <header className={styles.pageHeader + ' ' + styles.screenOnly}>
        <h1 className="page-title">Location QR labels</h1>
        <Link className="btn" href={route + '?id=' + location.id}>
          Back to location
        </Link>
      </header>
      <LabelSheet primaryId={location.id} locations={locations} baseUrl={configuredAppUrl()} />
    </div>
  );
}
