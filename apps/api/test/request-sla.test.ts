import { expect, it } from 'vitest';
import { DEFAULT_SITE_CALENDAR } from '@cafm/shared';
import { requestDeadline } from '../src/modules/helpdesk/request-sla';

it('consumes only open minutes, skipping bank holidays and custom closures', () => {
  const result = requestDeadline(new Date('2026-12-24T16:30:00Z'), 60, {
    ...DEFAULT_SITE_CALENDAR,
    jurisdiction: 'wales',
    closures: [{ name: 'Office shutdown', from: '2026-12-29', to: '2026-12-30' }],
  });
  expect(result?.toISOString()).toBe('2026-12-31T09:30:00.000Z');
});

it('uses elapsed minutes through the repeated hour when the clocks go back', () => {
  const result = requestDeadline(new Date('2026-10-25T00:00:00Z'), 100, {
    ...DEFAULT_SITE_CALENDAR,
    hours: [{ day: 7, opens: '01:00', closes: '02:30' }],
  });
  expect(result?.toISOString()).toBe('2026-10-25T01:40:00.000Z');
});

it('handles sites with no opening hours and 24-hour emergency targets', () => {
  const start = new Date('2026-12-25T14:00:00Z');
  expect(requestDeadline(start, 15, { ...DEFAULT_SITE_CALENDAR, hours: [] })).toBeNull();
  expect(requestDeadline(start, 15, null)?.toISOString()).toBe('2026-12-25T14:15:00.000Z');
});
