import { describe, expect, it } from 'vitest';
import { applyMobileChanges, type MobileChanges, type MobilePackJob } from '@cafm/shared';

const job = (id: string, title: string): MobilePackJob => ({ id, title }) as MobilePackJob;
const changes = (jobs: MobilePackJob[], jobIds: string[]): MobileChanges => ({
  syncToken: 't',
  generatedAt: 't',
  jobs,
  jobIds,
});

describe('applyMobileChanges', () => {
  it('replaces a changed job and keeps the others', () => {
    const result = applyMobileChanges([job('a', 'old'), job('b', 'same')], changes([job('a', 'new')], ['a', 'b']));
    expect(result.map((j) => j.title)).toEqual(['new', 'same']);
  });

  it('adds a new job and drops one that is no longer held by the person', () => {
    const result = applyMobileChanges([job('a', 'a'), job('b', 'b')], changes([job('c', 'c')], ['c', 'a']));
    expect(result.map((j) => j.id)).toEqual(['c', 'a']);
  });

  it('follows the server order and ignores ids it has no job for', () => {
    const result = applyMobileChanges([job('a', 'a'), job('b', 'b')], changes([], ['b', 'x', 'a']));
    expect(result.map((j) => j.id)).toEqual(['b', 'a']);
  });
});
