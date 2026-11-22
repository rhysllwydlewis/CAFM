import { describe, expect, it } from 'vitest';
import { DEFAULT_SITE_CALENDAR, bankHolidays, siteBusinessHoursOn, siteCalendarSchema } from '@cafm/shared';

describe('site business calendars', () => {
  it('uses the bank holiday division for the site jurisdiction and honours opt-outs', () => {
    const england = { ...DEFAULT_SITE_CALENDAR, jurisdiction: 'england' } as const;
    expect(bankHolidays('wales')).toEqual(bankHolidays('england'));
    expect(siteBusinessHoursOn({ ...england, jurisdiction: 'scotland' }, '2026-01-02')).toEqual([]);
    expect(siteBusinessHoursOn(england, '2026-01-02')).toHaveLength(1);
    expect(siteBusinessHoursOn({ ...england, jurisdiction: 'northern-ireland' }, '2026-03-17')).toEqual([]);
    expect(siteBusinessHoursOn({ ...england, observeBankHolidays: false }, '2026-05-04')).toHaveLength(1);
  });

  it('returns ordered split windows, respects weekends and closes inclusive local dates', () => {
    const hours = [
      { day: 1, opens: '13:00', closes: '18:00' },
      { day: 1, opens: '08:00', closes: '12:00' },
    ];
    const calendar = {
      ...DEFAULT_SITE_CALENDAR,
      hours,
      closures: [{ name: 'Building works', from: '2026-12-20', to: '2026-12-21' }],
    };
    expect(siteBusinessHoursOn(calendar, '2026-12-14')).toEqual([hours[1], hours[0]]);
    expect(siteBusinessHoursOn(calendar, '2026-12-20')).toEqual([]);
    expect(siteBusinessHoursOn(calendar, '2026-12-21')).toEqual([]);
    expect(siteBusinessHoursOn(calendar, '2026-12-28')).toHaveLength(2);
  });

  it.each([
    { timeZone: 'Invalid/Zone' },
    { hours: [{ day: 1, opens: '18:00', closes: '08:00' }] },
    {
      hours: [
        { day: 1, opens: '08:00', closes: '12:00' },
        { day: 1, opens: '11:00', closes: '14:00' },
      ],
    },
    { closures: [{ name: 'Closure', from: '2026-02-30', to: '2026-03-02' }] },
    { closures: [{ name: 'Closure', from: '2026-03-03', to: '2026-03-02' }] },
  ])('rejects invalid calendar settings', (invalid) => {
    expect(siteCalendarSchema.safeParse({ ...DEFAULT_SITE_CALENDAR, ...invalid }).success).toBe(false);
  });
});

describe('calendar validation messages', () => {
  const calendar = (hours: unknown[], timeZone = 'Europe/London') => ({
    jurisdiction: 'wales',
    timeZone,
    observeBankHolidays: true,
    hours,
    closures: [],
  });
  const messages = (input: unknown) => {
    const result = siteCalendarSchema.safeParse(input);
    return result.success ? [] : result.error.issues.map((issue) => issue.message);
  };

  it('explains a badly typed time once, instead of "Invalid" and a misleading ordering error', () => {
    expect(messages(calendar([{ day: 1, opens: '9am', closes: '17:00' }]))).toEqual([
      'Enter a time as hours and minutes, like 09:00.',
    ]);
    expect(messages(calendar([{ day: 1, opens: '09:00', closes: '5pm' }]))).toEqual([
      'Enter a time as hours and minutes, like 09:00.',
    ]);
    expect(messages(calendar([{ day: 1, opens: '17:00', closes: '09:00' }]))).toEqual([
      'Closing time must be after opening time.',
    ]);
  });

  it('stores the time zone in its standard spelling', () => {
    const result = siteCalendarSchema.parse(calendar([], 'europe/london'));
    expect(result.timeZone).toBe('Europe/London');
    expect(messages(calendar([], 'Mars/Olympus'))).toEqual(['Enter a valid IANA time zone.']);
  });
});
