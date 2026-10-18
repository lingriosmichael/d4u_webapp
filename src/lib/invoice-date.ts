// The invoice date (Rechnungsdatum, expenses.invoice_date) is a calendar
// day, "YYYY-MM-DD", the same string an <input type="date"> holds. It's
// handled as that string throughout — never through new Date(), which
// would read it as midnight UTC and could show the previous day.
// The backend re-validates it (d4u_backend src/lib/invoice-date.ts); the
// checks here only keep the forms from sending what it would refuse.

const DISPLAY_TIME_ZONE = "Europe/Berlin";
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Today's calendar day in Berlin, as "YYYY-MM-DD" — the latest invoice
 * date the backend accepts, and the date input's `max`. */
export function todayInBerlin(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: DISPLAY_TIME_ZONE });
}

/** Whether a date input's value is one the backend accepts: a full date,
 * not after today. */
export function isAllowedInvoiceDate(value: string, today: string = todayInBerlin()): boolean {
  return ISO_DATE.test(value) && value <= today;
}

/** "2026-10-01" → "01.10.2026". */
export function formatInvoiceDate(value: string): string {
  const match = ISO_DATE.exec(value);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
}

/** For Excel: the calendar day as a UTC-midnight Date, so Excel (which has
 * no time zones) shows exactly that day. */
export function invoiceDateAsExcelDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}
