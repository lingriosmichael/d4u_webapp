// "1500", "1500,5", "1.500", "1.234,56" -- optional thousands groups, optional ,dd
const GERMAN_AMOUNT = /^(\d+|\d{1,3}(\.\d{3})+)(,\d{1,2})?$/;
// "1.5", "1500.50" -- a dot followed by one or two digits is a decimal point
const DOT_DECIMAL_AMOUNT = /^\d+\.\d{1,2}$/;

/**
 * Parses a EUR amount typed in a form, strictly. Returns NaN for anything
 * that isn't unambiguously an amount with at most two decimals, so the form
 * can refuse it instead of submitting a silently different number.
 *
 * Accepted:
 * - German notation: "1500", "1500,5", "1.500", "1.234,56", "1.234.567,89"
 *   ("." followed by groups of exactly three digits is thousands grouping,
 *   so "1.500" is 1500, not 1.5)
 * - A dot as the decimal separator with one or two decimals: "1.5", "1500.50"
 * - Surrounding spaces and a "€" sign
 *
 * Rejected (NaN): "12abc", "1,500" (three decimals), "1,2,3", "-5", "", and
 * more than two decimals. The previous lenient parser read "1.500" as 1.5
 * and "12abc" as 12.
 */
export function parseGermanAmount(raw: string): number {
  const compact = raw.replace(/[\s€]/g, "");

  if (GERMAN_AMOUNT.test(compact)) {
    return Number(compact.replace(/\./g, "").replace(",", "."));
  }
  if (DOT_DECIMAL_AMOUNT.test(compact)) {
    return Number(compact);
  }
  return NaN;
}

/** Shown under an amount field whose text parseGermanAmount rejects. */
export const INVALID_AMOUNT_HINT = "Bitte einen gültigen Betrag eingeben, z. B. 1.234,56";

/** A number as the text an amount field shows: 1234.5 → "1234,50". */
export function formatAmountInput(amount: number): string {
  return amount.toFixed(2).replace(".", ",");
}

/**
 * Net from gross at a VAT rate, rounded to cents -- the same formula the
 * backend checks submitted net amounts against (receipt route,
 * confirm_payment), so a prefilled net is always accepted.
 */
export function netFromGross(gross: number, vatRatePercent: number): number {
  return Math.round((gross / (1 + vatRatePercent / 100)) * 100) / 100;
}
