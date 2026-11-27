import { expect, it } from 'vitest';
import { Prisma } from '@fmstead/db';
import { nextMeterTotal } from '../src/modules/assets/meter-reading';

const decimal = (value: string) => new Prisma.Decimal(value);

it('keeps fractional precision and supports an explicit wrap even when the display increases', () => {
  const limit = decimal('1000');
  const previous = { value: decimal('999.999999'), total: decimal('1999.999999') };
  expect(nextMeterTotal(decimal('0.000001'), previous, limit, true).toFixed()).toBe('2000.000001');
  expect(nextMeterTotal(decimal('900'), { value: decimal('800'), total: decimal('1800') }, limit, true).toFixed()).toBe(
    '2900',
  );
  expect(
    nextMeterTotal(decimal('0.2'), { value: decimal('0.1'), total: decimal('1000.1') }, limit, false).toFixed(),
  ).toBe('1000.2');
});

it('rejects impossible rollovers, falls and out-of-range display values', () => {
  const previous = { value: decimal('2'), total: decimal('2') };
  expect(() => nextMeterTotal(decimal('1'), previous, null, true)).toThrow();
  expect(() => nextMeterTotal(decimal('1'), undefined, decimal('10'), true)).toThrow();
  expect(() => nextMeterTotal(decimal('1'), previous, decimal('10'), false)).toThrow();
  expect(() => nextMeterTotal(decimal('10'), previous, decimal('10'), false)).toThrow();
  expect(nextMeterTotal(decimal('0'), undefined, null, false).toFixed()).toBe('0');
});
