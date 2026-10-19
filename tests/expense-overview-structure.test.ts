import { describe, expect, it } from "vitest";
import { OPEN_EXPENSE_STATUSES, type ExpenseStatus } from "@/lib/mock-data";
import { responsiblePartyForStatus } from "@/lib/approval-stage-role";
import {
  countsTowardTotal,
  daysWaiting,
  flattenStructuredOverview,
  formatDaysWaiting,
  structureExpenseOverview,
  waitingOn,
  type ExpenseOverviewRow,
} from "@/lib/expense-overview-structure";

function overviewRow(overrides: Partial<ExpenseOverviewRow>): ExpenseOverviewRow {
  return {
    id: "row",
    projectId: "p1",
    projectCode: "BIB-24",
    projectName: "Bildungsinitiative Berlin",
    costCenterId: "c1",
    costCenterCode: "3200",
    costCenterName: "Verpflegung",
    status: "accounting_approval",
    submittedByName: "Thomas Meier",
    amount: 100,
    description: "Catering",
    vendorName: null,
    expenseType: "standard",
    createdAt: "2026-10-01T09:00:00Z",
    statusSince: "2026-10-01T09:00:00Z",
    reconcilesAdvanceId: null,
    parentAdvanceDescription: null,
    invoiceNumber: null,
    invoiceDate: null,
    paidAt: null,
    documentRef: null,
    receiptStatus: "attached",
    accountingNote: null,
    accounting: null,
    ...overrides,
  };
}

// A 3 € partner advance split into three 1 € line items — the double-count
// case found in the 13 Oct 2026 review.
const advance = overviewRow({
  id: "adv",
  expenseType: "partner_advance",
  status: "reconciliation_in_progress",
  amount: 3,
  description: "Vorschuss Kulturfonds",
  costCenterCode: null,
  costCenterName: null,
  submittedByName: "Katrina Zuchina",
});
const lines = ["l1", "l2", "l3"].map((id, i) =>
  overviewRow({
    id,
    status: "awaiting_receipt",
    amount: 1,
    description: `Position ${i + 1}`,
    reconcilesAdvanceId: "adv",
    parentAdvanceDescription: "Vorschuss Kulturfonds",
    costCenterCode: null,
    costCenterName: null,
    submittedByName: "Katrina Zuchina",
    createdAt: `2026-10-13T10:0${i}:00Z`,
  }),
);

describe("structureExpenseOverview", () => {
  it("counts a split advance once, through its line items", () => {
    const overview = structureExpenseOverview([advance, ...lines]);
    expect(overview.total).toBe(3);
    expect(overview.rowCount).toBe(4);
    expect(overview.hasSplitAdvances).toBe(true);
    expect(overview.groups[0].items).toHaveLength(1);
    expect(overview.groups[0].items[0].children.map((c) => c.id)).toEqual(["l1", "l2", "l3"]);
  });

  it("counts an advance that hasn't been split yet with its full amount", () => {
    const unsplit = overviewRow({
      expenseType: "partner_advance",
      status: "submitted_unverified",
      amount: 5000,
    });
    expect(countsTowardTotal(unsplit)).toBe(true);
    expect(structureExpenseOverview([unsplit]).total).toBe(5000);
  });

  it("shows a line item on its own, naming its advance, when the advance is filtered out", () => {
    const overview = structureExpenseOverview([lines[0]]);
    expect(overview.groups[0].items[0].row.id).toBe("l1");
    expect(overview.groups[0].items[0].children).toEqual([]);
    expect(overview.total).toBe(1);
  });

  it("orders open items longest-waiting first, then finished ones newest first", () => {
    const rows = [
      overviewRow({ id: "paid-old", status: "paid", createdAt: "2026-05-01T00:00:00Z" }),
      overviewRow({ id: "waiting-short", statusSince: "2026-10-10T00:00:00Z" }),
      overviewRow({ id: "paid-new", status: "paid", createdAt: "2026-09-01T00:00:00Z" }),
      overviewRow({ id: "waiting-long", statusSince: "2026-08-30T00:00:00Z" }),
    ];
    const order = flattenStructuredOverview(structureExpenseOverview(rows)).map((r) => r.id);
    expect(order).toEqual(["waiting-long", "waiting-short", "paid-new", "paid-old"]);
  });

  it("lists each line item right after its advance", () => {
    const order = flattenStructuredOverview(
      structureExpenseOverview([lines[2], advance, lines[0], lines[1]]),
    );
    expect(order.map((r) => r.id)).toEqual(["adv", "l1", "l2", "l3"]);
  });
});

describe("waitingOn", () => {
  it.each<[ExpenseStatus, string | null]>([
    ["ceo_approval", "Geschäftsführung"],
    ["accounting_approval", "Buchhaltung"],
    ["awaiting_payment", "Buchhaltung"],
    ["submitted_unverified", "Buchhaltung"],
    ["reconciliation_submitted", "Buchhaltung"],
    ["needs_changes", "Thomas Meier"],
    ["reconciliation_in_progress", "Thomas Meier"],
    ["awaiting_receipt", "Thomas Meier"],
    ["paid", null],
    ["reconciled", null],
  ])("%s → %s", (status, expected) => {
    expect(waitingOn(overviewRow({ status }))).toBe(expected);
  });

  it("falls back to Einreicher:in when the submitter's name can't be read", () => {
    expect(waitingOn(overviewRow({ status: "needs_changes", submittedByName: null }))).toBe(
      "Einreicher:in",
    );
  });

  it("names someone for every open status except the never-written 'submitted'", () => {
    const nobody = OPEN_EXPENSE_STATUSES.filter(
      (s) => s !== "submitted" && responsiblePartyForStatus(s) === null,
    );
    expect(nobody).toEqual([]);
  });
});

describe("daysWaiting", () => {
  const now = new Date("2026-10-13T10:00:00Z");

  it("counts Berlin calendar days in the current status", () => {
    expect(daysWaiting(overviewRow({ statusSince: "2026-10-13T06:00:00Z" }), now)).toBe(0);
    // 23:30 UTC on 11 Oct is 12 Oct in Berlin: one day, not two.
    expect(daysWaiting(overviewRow({ statusSince: "2026-10-11T23:30:00Z" }), now)).toBe(1);
    expect(daysWaiting(overviewRow({ statusSince: "2026-08-30T09:00:00Z" }), now)).toBe(44);
  });

  it("is empty once nobody is waiting", () => {
    expect(daysWaiting(overviewRow({ status: "paid" }), now)).toBeNull();
  });

  it("reads as words", () => {
    expect([0, 1, 44, null].map(formatDaysWaiting)).toEqual(["heute", "1 Tag", "44 Tage", ""]);
  });
});
