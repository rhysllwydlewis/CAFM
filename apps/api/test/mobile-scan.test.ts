import { describe, expect, it } from 'vitest';
import { matchScan, readScannedCode, type MobilePackJob } from '@cafm/shared';

const TAG = '66666666-6666-4666-8666-666666666666';
const ASSET = '55555555-5555-4555-8555-555555555555';
const job = (number: string, assetId: string | null = ASSET) =>
  ({
    id: 'id-' + number,
    number,
    location: { name: 'Plant room' },
    asset: assetId ? { id: assetId, name: 'Boiler 2', number: 'AST-0002', locationId: 'l' } : null,
    assetDetail: assetId
      ? {
          make: null,
          model: null,
          serial: null,
          tags: [{ id: TAG, code: 'TAG-0002' }],
          meters: [{ id: 'm', name: 'Run hours', unit: 'h', rolloverAt: null }],
        }
      : null,
  }) as unknown as MobilePackJob;

describe('mobile scan', () => {
  it('reads a label link, a code parameter and plain text', () => {
    expect(readScannedCode('https://cafm.example/asset-qr/' + ASSET)).toBe(ASSET);
    expect(readScannedCode('https://cafm.example/asset-qr?code=ast-0002')).toBe('ast-0002');
    expect(readScannedCode('  AST-0002 ')).toBe('AST-0002');
  });

  it('finds an asset by link or number, with its open jobs and meters', () => {
    const jobs = [job('WO-1'), job('WO-2'), job('WO-3', null)];
    for (const code of ['https://x.test/asset-qr/' + TAG, 'tag-0002', 'ast-0002']) {
      const match = matchScan(code, jobs);
      expect(match.kind).toBe('asset');
      if (match.kind === 'asset') {
        expect(match.jobs.map((j) => j.number)).toEqual(['WO-1', 'WO-2']);
        expect(match.meters).toHaveLength(1);
        expect(match.location).toBe('Plant room');
      }
    }
  });

  it('finds a job by its number, and says nothing matched otherwise', () => {
    expect(matchScan('wo-3', [job('WO-3', null)]).kind).toBe('job');
    expect(matchScan('AST-9999', [job('WO-1')]).kind).toBe('none');
    expect(matchScan('   ', [job('WO-1')]).kind).toBe('none');
  });
});
