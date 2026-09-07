/**
 * Parses a currency amount typed in German notation, where "," is the
 * decimal separator and "." is an optional thousands separator (e.g.
 * "1.234,56"). `parseFloat(raw.replace(",", "."))` — the previous approach
 * in both upload forms — only replaces the first comma, so "1.234,56"
 * became "1.234.56" and parseFloat stopped at the second "." and returned
 * 1.234, silently truncating a real four-figure amount to about a
 * thousandth of its value (BUG-010, test-run/findings/BUGS.md).
 *
 * Whichever of "," or "." appears LAST in the string is treated as the
 * decimal separator; any occurrences of the other character before it are
 * stripped as thousands grouping. A bare "1234.56" or "1.234" (a single
 * separator with no comma at all) is left as parseFloat would already
 * interpret it, matching prior behavior for those inputs.
 */
export function parseGermanAmount(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed === "") return NaN;

  const lastComma = trimmed.lastIndexOf(",");
  const lastDot = trimmed.lastIndexOf(".");

  let normalized: string;
  if (lastComma > lastDot) {
    normalized =
      trimmed.slice(0, lastComma).replace(/\./g, "") + "." + trimmed.slice(lastComma + 1);
  } else if (lastDot > lastComma) {
    normalized = trimmed.slice(0, lastDot).replace(/,/g, "") + "." + trimmed.slice(lastDot + 1);
  } else {
    normalized = trimmed;
  }

  return parseFloat(normalized);
}
