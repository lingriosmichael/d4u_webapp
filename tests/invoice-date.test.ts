import { describe, expect, it } from "vitest";
import {
  formatInvoiceDate,
  invoiceDateAsExcelDate,
  isAllowedInvoiceDate,
  todayInBerlin,
} from "@/lib/invoice-date";

// The invoice date is a calendar day. These checks mirror the backend's
// (d4u_backend tests/invoice-date.test.ts) so the forms don't send a date
// it would refuse, and make sure no step shifts the day by a time zone.

describe("isAllowedInvoiceDate", () => {
  it("allows today and earlier", () => {
    expect(isAllowedInvoiceDate("2026-10-18", "2026-10-18")).toBe(true);
    expect(isAllowedInvoiceDate("2025-12-31", "2026-10-18")).toBe(true);
  });

  it.each(["", "2026-10-19", "18.10.2026"])("refuses %j", (value) => {
    expect(isAllowedInvoiceDate(value, "2026-10-18")).toBe(false);
  });
});

describe("todayInBerlin", () => {
  it("uses the Berlin calendar day, not UTC's", () => {
    expect(todayInBerlin(new Date("2026-10-17T22:30:00Z"))).toBe("2026-10-18");
  });
});

describe("formatting", () => {
  it("shows the date German-style without shifting the day", () => {
    expect(formatInvoiceDate("2026-10-01")).toBe("01.10.2026");
  });

  it("gives Excel the same calendar day", () => {
    expect(invoiceDateAsExcelDate("2026-10-01").toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });
});
