import { ScanResult } from '../scan-result';

export const metadata = { title: 'Asset tag', robots: { index: false } };

export default async function AssetTagPage({ params }: { params: Promise<{ id: string }> }) {
  return <ScanResult query={await params} />;
}
