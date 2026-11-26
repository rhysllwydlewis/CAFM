import { UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@fmstead/db';

type Decimal = Prisma.Decimal;
const MeterDecimal = Prisma.Decimal.clone({ precision: 32 });

/** A rollover denotes one complete wrap of the display. The caller records the physical event explicitly. */
export function nextMeterTotal(
  value: Decimal,
  previous: { value: Decimal; total: Decimal } | undefined,
  rolloverAt: Decimal | null,
  rolledOver: boolean,
): Decimal {
  if (rolloverAt && value.gte(rolloverAt)) {
    throw new UnprocessableEntityException('Enter a reading below the rollover limit.');
  }
  if (rolledOver) {
    if (!previous || !rolloverAt) {
      throw new UnprocessableEntityException('A rollover needs a previous reading and a rollover limit.');
    }
    return new MeterDecimal(previous.total).plus(rolloverAt.minus(previous.value)).plus(value);
  }
  if (!previous) return value;
  if (value.lt(previous.value)) {
    throw new UnprocessableEntityException('This reading is lower than the last one. Confirm the meter rolled over.');
  }
  return new MeterDecimal(previous.total).plus(value.minus(previous.value));
}
