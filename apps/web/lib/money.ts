/** The decimal places a currency uses: 2 for pounds, 0 for yen. */
export function currencyDigits(currency: string): number {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/** An amount typed as 18500 or 18500.50 (a symbol or commas are fine), as whole minor units. Null if it isn't one. */
export function moneyToMinor(text: string, digits = 2): number | null {
  const pattern = digits > 0 ? new RegExp(`^(\\d+)(?:\\.(\\d{1,${digits}}))?$`) : /^(\d+)$/;
  const match = text
    .trim()
    .replace(/^[£$€]/, '')
    .replace(/,/g, '')
    .match(pattern);
  if (!match) return null;
  const minor = Number(match[1]) * 10 ** digits + Number((match[2] ?? '').padEnd(digits, '0') || 0);
  return Number.isSafeInteger(minor) ? minor : null;
}

export const minorToMoney = (amountMinor: number, digits = 2) => (amountMinor / 10 ** digits).toFixed(digits);
