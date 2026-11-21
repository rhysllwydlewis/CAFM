import { describe, expect, it } from 'vitest';
import { formatNumber, validateFormat } from '../src';

describe('numbering formats', () => {
  it('formats with UK dates, padding and context', () => {
    // 23:30 UTC on 31 Dec is still 31 Dec in London in winter, but 1 Jun 23:30 UTC is 2 Jun in BST.
    expect(formatNumber('WO-{YYYY}-{00000}', 4801, new Date('2026-12-31T23:30:00Z'))).toBe('WO-2026-04801');
    expect(formatNumber('{YY}{MM}-{000}', 7, new Date('2026-05-31T23:30:00Z'))).toBe('2606-007');
    expect(formatNumber('WO-{SITE}-{00000}', 12, new Date(), { SITE: 'CDF' })).toBe('WO-CDF-00012');
  });

  it('validates formats', () => {
    expect(validateFormat('WO-{00000}')).toBeNull();
    expect(validateFormat('WO-{YYYY}')).toBe('Include exactly one sequence, like {00000}');
    expect(validateFormat('WO-{000}-{000}')).toBe('Include exactly one sequence, like {00000}');
    expect(validateFormat('WO-{00000')).toBe('Check the braces: use tokens like {YYYY} or {00000}');
  });

  it('needs every context token', () => {
    expect(() => formatNumber('WO-{SITE}-{000}', 1)).toThrow('No value for {SITE}');
  });
});
