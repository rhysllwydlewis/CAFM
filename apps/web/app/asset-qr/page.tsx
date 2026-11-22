import Link from 'next/link';
import { Button, Field, TextInput } from '@cafm/ui';
import { ScanResult } from './scan-result';

export const metadata = { title: 'Find asset by tag', robots: { index: false } };

export default async function AssetTagLookup({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  if (code !== undefined) return <ScanResult query={{ code }} />;
  return (
    <main className="page">
      <div className="card card-b stack g3">
        <h1 className="page-title">Find an asset tag</h1>
        <form action="/asset-qr" className="stack g3">
          <Field label="Scan or enter tag code" htmlFor="tag-code">
            <TextInput id="tag-code" name="code" maxLength={24} required />
          </Field>
          <div className="row wrap g2">
            <Button type="submit" variant="primary">
              Find asset
            </Button>
            <Link className="btn" href="/portal">
              Back to My requests
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}
