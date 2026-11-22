import { ScanResult } from './scan-result';

export const metadata = { title: 'Find asset by tag', robots: { index: false } };

export default async function AssetTagLookup({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  return <ScanResult query={await searchParams} />;
}
