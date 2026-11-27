import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { assetScanSchema, type AssetScan } from '@fmstead/shared';
import { apiGet } from '@/lib/api';

export async function ScanResult({ query }: { query: { id: string } | { code?: string } }) {
  const parsed = assetScanSchema.safeParse(query);
  if (!parsed.success && 'id' in query) notFound();
  if (!parsed.success) {
    return (
      <main className="page">
        <p role="alert">Enter a valid asset tag code.</p>
        <Link href="/asset-qr">Try another tag code</Link>
      </main>
    );
  }
  const key = parsed.data;
  const next = 'id' in key ? '/asset-qr/' + key.id : '/asset-qr?code=' + key.code;
  const response = await apiGet('/asset-tags/resolve?' + new URLSearchParams(key));
  if (response.status === 401) redirect('/login?next=' + encodeURIComponent(next));
  if (response.status === 403) redirect('/select-organisation?next=' + encodeURIComponent(next));
  if (response.ok) {
    const result: AssetScan = await response.json();
    redirect(
      result.destination === 'report'
        ? '/portal/new?asset=' + result.assetId + '&source=' + ('id' in key ? 'tag' : 'barcode')
        : '/app/assets/' + result.assetId,
    );
  }
  if (response.status !== 404) throw new Error('Could not resolve the asset tag.');
  return (
    <main className="page">
      <section className="card card-b stack g3">
        <h1 className="page-title">Asset tag unavailable</h1>
        <p>This tag may have been retired or be outside the parts of the organisation you can access.</p>
        <div className="row wrap g2">
          <Link className="btn primary" href={'/select-organisation?next=' + encodeURIComponent(next)}>
            Switch organisation
          </Link>
          <Link className="btn" href="/asset-qr">
            Try another tag code
          </Link>
          <Link className="btn" href="/app">
            Go to FM Stead
          </Link>
        </div>
      </section>
    </main>
  );
}
