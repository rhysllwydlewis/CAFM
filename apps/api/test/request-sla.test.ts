import { describe, expect, it } from 'vitest';
import { DEFAULT_SITE_CALENDAR } from '@fmstead/shared';
import { elapsedMinutes, requestDeadline } from '../src/modules/helpdesk/request-sla';

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

describe('elapsedMinutes', () => {
  const at = (iso: string) => new Date(iso);

  it('counts only the minutes inside opening hours, skipping weekends and bank holidays', () => {
    // Friday 16:30 to Monday 09:30 is half an hour on each side of the weekend.
    expect(elapsedMinutes(at('2026-11-27T16:30:00Z'), at('2026-11-30T09:30:00Z'), DEFAULT_SITE_CALENDAR)).toBe(60);
    // Christmas Day and Boxing Day are bank holidays, and the weekend follows.
    expect(
      elapsedMinutes(at('2026-12-24T16:30:00Z'), at('2026-12-29T09:30:00Z'), {
        ...DEFAULT_SITE_CALENDAR,
        jurisdiction: 'wales',
      }),
    ).toBe(60);
  });

  it('is the exact inverse of the deadline calculation', () => {
    for (const [start, minutes] of [
      ['2026-11-23T10:00:00Z', 90],
      ['2026-11-26T16:45:00Z', 600],
      ['2026-12-23T12:00:00Z', 2000],
      ['2026-11-28T09:00:00Z', 45],
    ] as const) {
      const deadline = requestDeadline(at(start), minutes, DEFAULT_SITE_CALENDAR)!;
      expect(elapsedMinutes(at(start), deadline, DEFAULT_SITE_CALENDAR)).toBeCloseTo(minutes, 6);
    }
  });

  it('counts every minute for a round-the-clock target, and none when the site has no opening hours', () => {
    expect(elapsedMinutes(at('2026-12-25T14:00:00Z'), at('2026-12-26T14:30:00Z'), null)).toBe(1470);
    expect(
      elapsedMinutes(at('2026-12-25T14:00:00Z'), at('2026-12-26T14:30:00Z'), { ...DEFAULT_SITE_CALENDAR, hours: [] }),
    ).toBe(0);
    expect(elapsedMinutes(at('2026-12-25T14:00:00Z'), at('2026-12-25T14:00:00Z'), null)).toBe(0);
    expect(elapsedMinutes(at('2026-12-25T15:00:00Z'), at('2026-12-25T14:00:00Z'), null)).toBe(0);
  });

  it('handles windows that end at 24:00 and the hour the clocks go back', () => {
    const overnight = {
      ...DEFAULT_SITE_CALENDAR,
      hours: [
        { day: 1, opens: '18:00', closes: '24:00' },
        { day: 2, opens: '00:00', closes: '06:00' },
      ],
    };
    expect(elapsedMinutes(at('2026-11-23T22:00:00Z'), at('2026-11-24T03:00:00Z'), overnight)).toBe(300);
    const repeated = { ...DEFAULT_SITE_CALENDAR, hours: [{ day: 7, opens: '01:00', closes: '02:30' }] };
    expect(elapsedMinutes(at('2026-10-25T00:00:00Z'), at('2026-10-25T01:40:00Z'), repeated)).toBe(100);
  });
});
