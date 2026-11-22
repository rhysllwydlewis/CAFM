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

it('runs the clock to midnight when a window closes at 24:00', () => {
  // Overnight opening is entered as two windows, the first ending at 24:00 (docs/locations.md).
  const calendar = {
    ...DEFAULT_SITE_CALENDAR,
    hours: [
      { day: 1, opens: '18:00', closes: '24:00' },
      { day: 2, opens: '00:00', closes: '06:00' },
    ],
  };
  // Monday 22:00 to Tuesday 03:00 is five hours, split by midnight.
  expect(requestDeadline(new Date('2026-11-23T22:00:00Z'), 5 * 60, calendar)?.toISOString()).toBe(
    '2026-11-24T03:00:00.000Z',
  );
  // On Sunday 25 October the clocks go back, so 22:00 to 24:00 is two hours (22:00Z to 00:00Z).
  // 150 minutes uses all of that Sunday and 30 minutes of the next.
  expect(
    requestDeadline(new Date('2026-10-24T23:00:00Z'), 150, {
      ...DEFAULT_SITE_CALENDAR,
      hours: [{ day: 7, opens: '22:00', closes: '24:00' }],
    })?.toISOString(),
  ).toBe('2026-11-01T22:30:00.000Z');
});

it('does not double count overlapping real instants on the autumn clock change', () => {
  const result = requestDeadline(new Date('2026-10-25T00:00:00Z'), 100, {
    ...DEFAULT_SITE_CALENDAR,
    hours: [
      { day: 7, opens: '01:00', closes: '01:30' },
      { day: 7, opens: '01:30', closes: '02:30' },
    ],
  });
  expect(result?.toISOString()).toBe('2026-10-25T01:40:00.000Z');
});
