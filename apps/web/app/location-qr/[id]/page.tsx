import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { can, feature, type CurrentUser } from '@cafm/shared';
import { apiGet } from '@/lib/api';
import { locationDetail, route, validLocationId } from '../../(app)/app/locations/location-data';

export const metadata: Metadata = { title: 'Location QR', robots: { index: false } };

export default async function LocationQrPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!validLocationId(id)) notFound();
  const next = encodeURIComponent('/location-qr/' + id);
  const response = await apiGet('/auth/me');
  if (response.status === 401) redirect('/login?next=' + next);
  if (response.status === 403) redirect('/select-organisation?next=' + next);
  if (!response.ok) throw new Error('Could not load your CAFM session.');
  const user = (await response.json()) as CurrentUser;

  // Helpdesk uses this same URL and location ID when fault intake ships in P1-03.
  if (can(user, 'locations.read') && feature(user.entitlements, 'locations') && (await locationDetail(id))) {
    redirect(route + '?id=' + id);
  }
  return (
    <main className="page">
      <div className="card card-b stack g3">
        <h1 className="page-title">Location unavailable</h1>
        <p>Check that you’re signed in to the organisation that issued this label.</p>
        <Link href="/app" className="btn">
          Go to CAFM
        </Link>
      </div>
    </main>
  );
}
