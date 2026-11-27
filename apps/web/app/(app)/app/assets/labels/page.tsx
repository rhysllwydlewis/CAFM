import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { can, feature, type PrintableAssetTag } from '@fmstead/shared';
import { apiGet } from '@/lib/api';
import { configuredAppUrl } from '@/lib/public-url';
import { currentUser } from '@/lib/session';
import { assetDetail } from '../asset-data';
import { route, validAssetId } from '../asset-labels';
import styles from '../assets.module.css';
import { AssetLabelSheet } from './asset-label-sheet';

export const metadata = { title: 'Asset labels' };

export default async function LabelsPage({ searchParams }: { searchParams: Promise<{ asset?: string; q?: string }> }) {
  const [{ asset: id, q: raw }, user] = await Promise.all([searchParams, currentUser()]);
  if (!can(user, 'assets.read') || !feature(user.entitlements, 'assets')) redirect(route);
  if (id !== undefined && !validAssetId(id)) notFound();
  const q = typeof raw === 'string' ? raw.trim().slice(0, 120) : '';
  const query = new URLSearchParams({ ...(id && { asset: id }), ...(q && { q }) });
  const [asset, response] = await Promise.all([id ? assetDetail(id) : null, apiGet('/asset-tags/labels?' + query)]);
  if (id && !asset) notFound();
  if (!response.ok) throw new Error('Could not load asset labels.');
  const { items, hasMore }: { items: PrintableAssetTag[]; hasMore: boolean } = await response.json();
  return (
    <div className="page stack g4">
      <header className={styles.pageHeader + ' ' + styles.printControls}>
        <div>
          {asset && (
            <p className="eyebrow">
              <span className="mono">{asset.number}</span> · {asset.name}
            </p>
          )}
          <h1 className="page-title">Asset labels</h1>
        </div>
        <Link className="btn" href={id ? route + '/' + id + '/operations#tags' : route}>
          {id ? 'Back to asset records' : 'Back to assets'}
        </Link>
      </header>
      <div className={'card card-b row wrap g3 ' + styles.printControls}>
        <form action={route + '/labels'} className="row wrap g2">
          {id && <input type="hidden" name="asset" value={id} />}
          <label htmlFor="label-search">Filter labels</label>
          <input id="label-search" name="q" type="search" maxLength={120} defaultValue={q} className={styles.control} />
          <button className="btn" type="submit">
            Search
          </button>
        </form>
        <form action="/asset-qr" className="row wrap g2">
          <label htmlFor="barcode-lookup">Scan or enter tag code</label>
          <input id="barcode-lookup" name="code" className={styles.control} maxLength={24} required />
          <button className="btn" type="submit">
            Find asset
          </button>
        </form>
      </div>
      {hasMore && (
        <p className={'muted ' + styles.printControls}>
          Showing the first 100 tags. Filter by asset name, reference or tag code.
        </p>
      )}
      <AssetLabelSheet key={query.toString()} tags={items} primary={!!id} baseUrl={configuredAppUrl()} />
    </div>
  );
}
