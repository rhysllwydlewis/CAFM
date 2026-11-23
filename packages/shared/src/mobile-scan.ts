import type { MobilePackJob } from './mobile-sync';

/** What a scanned code points at, found among the jobs held on the phone (so it works without signal). */
export type ScanMatch =
  | { kind: 'none' }
  | { kind: 'job'; job: MobilePackJob }
  | {
      kind: 'asset';
      asset: { id: string; name: string; number: string };
      location: string;
      jobs: MobilePackJob[];
      meters: NonNullable<NonNullable<MobilePackJob['assetDetail']>['meters']>;
    };

/**
 * Reads what was scanned or typed. A label's QR code holds a link ending in the asset's id
 * (`/asset-qr/<id>`) or a `code` parameter; a barcode or typed entry is the asset number or a job number.
 */
export function readScannedCode(raw: string): string {
  const text = raw.trim();
  try {
    const url = new URL(text);
    const code = url.searchParams.get('code');
    if (code) return code.trim();
    const last = url.pathname.split('/').filter(Boolean).pop();
    return last ? decodeURIComponent(last) : '';
  } catch {
    return text;
  }
}

export function matchScan(raw: string, jobs: readonly MobilePackJob[]): ScanMatch {
  const code = readScannedCode(raw).toUpperCase();
  if (!code) return { kind: 'none' };
  const byJob = jobs.find((job) => job.number.toUpperCase() === code);
  if (byJob) return { kind: 'job', job: byJob };
  const onAsset = jobs.filter(
    (job) =>
      job.asset &&
      (job.asset.id.toUpperCase() === code ||
        job.asset.number.toUpperCase() === code ||
        (job.assetDetail?.tags ?? []).some((tag) => tag.id.toUpperCase() === code || tag.code.toUpperCase() === code)),
  );
  const first = onAsset[0];
  if (!first?.asset) return { kind: 'none' };
  return {
    kind: 'asset',
    asset: { id: first.asset.id, name: first.asset.name, number: first.asset.number },
    location: first.location.name,
    jobs: onAsset,
    meters: first.assetDetail?.meters ?? [],
  };
}
