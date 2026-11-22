import { describe, expect, it } from 'vitest';
import {
  addDays,
  addInterval,
  addMonths,
  daysBetween,
  endOfLocalDay,
  firstOccurrenceOnOrAfter,
  frequencyText,
  localDate,
  nextOccurrenceAfter,
  occurrence,
  weekStart,
  type PpmCalendarUnit,
} from '@cafm/shared';

describe('PPM dates', () => {
  it('adds days and months without drifting or going through a time zone', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonths('2026-01-15', -2)).toBe('2025-11-15');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addInterval('2028-02-29', 'year', 1)).toBe('2029-02-28');
    expect(addInterval('2026-11-23', 'week', 2)).toBe('2026-12-07');
    expect(addInterval('2026-11-23', 'year', 3)).toBe('2029-11-23');
    expect(daysBetween('2026-11-23', '2026-12-01')).toBe(8);
    expect(daysBetween('2026-12-01', '2026-11-23')).toBe(-8);
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
  });

  it('keeps a visit anchored to the 31st on the last day of shorter months, and back again', () => {
    const dates = [0, 1, 2, 3, 4].map((index) => occurrence('2026-01-31', 'month', 1, index));
    expect(dates).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
    // Each date is worked out from the anchor, so February does not pull every later month down to the 28th.
    expect(occurrence('2026-01-31', 'month', 3, 1)).toBe('2026-04-30');
    expect(occurrence('2028-02-29', 'year', 1, 1)).toBe('2029-02-28');
    expect(occurrence('2028-02-29', 'year', 4, 1)).toBe('2032-02-29');
  });

  it('finds the first visit on or after a date, the same as counting them one by one', () => {
    const units: PpmCalendarUnit[] = ['day', 'week', 'month', 'year'];
    const anchors = ['2026-01-31', '2024-02-29', '2026-11-23', '2025-12-31', '2026-03-01'];
    const froms = [
      '2025-12-31',
      '2026-01-31',
      '2026-02-01',
      '2026-02-28',
      '2026-03-31',
      '2026-11-22',
      '2027-02-28',
      '2030-06-15',
    ];
    for (const unit of units) {
      for (const interval of [1, 2, 3, 6, 12]) {
        for (const anchor of anchors) {
          for (const from of froms) {
            let index = 0;
            while (occurrence(anchor, unit, interval, index) < from) index += 1;
            const expected = occurrence(anchor, unit, interval, index);
            const found = firstOccurrenceOnOrAfter(anchor, unit, interval, from);
            expect(found, `${anchor} every ${interval} ${unit} from ${from}`).toBe(expected);
            // The one after is the following visit, never the same day.
            expect(nextOccurrenceAfter(anchor, unit, interval, found)).toBe(
              occurrence(anchor, unit, interval, index + 1),
            );
          }
        }
      }
    }
  });

  it('starts a schedule on its anchor and never before it', () => {
    expect(firstOccurrenceOnOrAfter('2026-12-01', 'month', 12, '2026-11-01')).toBe('2026-12-01');
    expect(firstOccurrenceOnOrAfter('2026-12-01', 'month', 12, '2026-12-01')).toBe('2026-12-01');
    expect(firstOccurrenceOnOrAfter('2026-12-01', 'month', 12, '2026-12-02')).toBe('2027-12-01');
  });

  it('finds the Monday of a week', () => {
    expect(weekStart('2026-11-23')).toBe('2026-11-23');
    expect(weekStart('2026-11-29')).toBe('2026-11-23');
    expect(weekStart('2026-11-30')).toBe('2026-11-30');
    expect(weekStart('2027-01-01')).toBe('2026-12-28');
  });

  it('ends a day at the end of that day in the site’s own time, summer or winter', () => {
    // GMT: the end of the day is the same moment in UTC.
    expect(endOfLocalDay('2026-12-01', 'Europe/London').toISOString()).toBe('2026-12-01T23:59:59.000Z');
    // BST: an hour earlier in UTC.
    expect(endOfLocalDay('2026-07-15', 'Europe/London').toISOString()).toBe('2026-07-15T22:59:59.000Z');
    // The days the clocks change.
    expect(endOfLocalDay('2026-03-29', 'Europe/London').toISOString()).toBe('2026-03-29T22:59:59.000Z');
    expect(endOfLocalDay('2026-10-25', 'Europe/London').toISOString()).toBe('2026-10-25T23:59:59.000Z');
    expect(endOfLocalDay('2026-07-15', 'America/New_York').toISOString()).toBe('2026-07-16T03:59:59.000Z');
  });

  it('reads the calendar day an instant falls on in a time zone', () => {
    expect(localDate(new Date('2026-07-15T23:30:00Z'), 'Europe/London')).toBe('2026-07-16');
    expect(localDate(new Date('2026-12-15T23:30:00Z'), 'Europe/London')).toBe('2026-12-15');
  });

  it('says how often a visit is made', () => {
    expect(frequencyText({ type: 'calendar', unit: 'month', interval: 12 })).toBe('every 12 months');
    expect(frequencyText({ type: 'calendar', unit: 'week', interval: 1 })).toBe('every week');
    expect(frequencyText({ type: 'meter', meterName: 'Run hours', interval: '250' })).toBe(
      'every 250 on the Run hours meter',
    );
  });
});
