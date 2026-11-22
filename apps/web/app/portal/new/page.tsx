import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { can, feature } from '@cafm/shared';
import { currentUser } from '@/lib/session';
import { catalogue, reportAsset, reportLocation } from '@/lib/helpdesk';
import { RequestForm } from '../../(app)/app/helpdesk/request-form';
import styles from '../../(app)/app/helpdesk/helpdesk.module.css';

export const metadata: Metadata = { title: 'Report a fault', robots: { index: false } };

export default async function NewRequest({
  searchParams,
}: {
  searchParams: Promise<{ location?: string; asset?: string; source?: string; draft?: string }>;
}) {
  const input = await searchParams;
  const params = new URLSearchParams();
  for (const key of ['location', 'asset', 'source', 'draft'] as const) {
    const value = input[key];
    if (typeof value === 'string' && value.length <= 100) params.set(key, value);
  }
  const user = await currentUser('/portal/new' + (params.size ? '?' + params.toString() : ''));
  if (!can(user, 'requests.create') || !feature(user.entitlements, 'helpdesk')) return null;
  const locationId = params.get('location');
  const assetId = params.get('asset');
  const [data, location, assetContext] = await Promise.all([
    catalogue(),
    locationId ? reportLocation(locationId) : null,
    assetId ? reportAsset(assetId) : null,
  ]);
  if (
    (locationId && !location) ||
    (assetId && !assetContext) ||
    (location && assetContext && location.id !== assetContext.location.id)
  )
    notFound();
  const prefill = assetContext?.location ?? location ?? undefined;
  const draft = params.get('draft');
  return (
    <div className={styles.portalContent + ' stack g4'}>
      <div className="page-head">
        <h1 className="page-title">Report a fault</h1>
        <div className={styles.actions}>
          {assetContext && can(user, 'assets.read') && feature(user.entitlements, 'assets') && (
            <Link className="btn" href={'/app/assets/' + assetContext.asset.id}>
              View asset
            </Link>
          )}
          {prefill && can(user, 'locations.read') && feature(user.entitlements, 'locations') && (
            <Link className="btn" href={'/app/locations?id=' + prefill.id}>
              View location
            </Link>
          )}
        </div>
      </div>
      <section className="card card-b">
        <RequestForm
          data={data}
          scanned={prefill}
          scannedAsset={assetContext?.asset}
          fromRegister={params.get('source') === 'register'}
          draftId={draft && /^[a-f0-9-]{36}$/i.test(draft) ? draft : undefined}
        />
      </section>
    </div>
  );
}
