import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type FakeRow } from "./helpers/fake-supabase";

// getExpenseDetail (src/lib/supabase/queries/expense-detail.ts) assembles
// the Expense Detail screen from RLS-scoped reads. Pinned: numerics arrive
// as strings and are shown as numbers; a row the reader can't see yields
// "not found", while a lookup RLS hides (submitter, partner, payment
// details) shows as null rather than failing the page; Verlauf and
// Korrekturen run oldest first with names; and the reconciled line items
// and the budget line are read only for display — the RPCs wrote them.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const { createClient } = await import("@/lib/supabase/server");
const { getExpenseDetail } = await import("@/lib/supabase/queries/expense-detail");

function useTables(tables: Record<string, FakeRow[]>) {
  const fake = createFakeSupabase(tables);
  vi.mocked(createClient).mockResolvedValue(fake.client as never);
  return fake;
}

beforeEach(() => {
  vi.mocked(createClient).mockReset();
});

const standardExpense: FakeRow = {
  id: "e1",
  status: "paid",
  expense_type: "standard",
  amount: "1500.50",
  reconciled_amount: null,
  description: "Catering Fachtag",
  vendor_name: "Bäckerei Schmidt",
  invoice_number: "R-2026-17",
  invoice_date: "2026-10-01",
  accounting_note: "Skonto genutzt",
  receipt_status: "attached",
  document_ref: "BIB-24/0b0e/rechnung.pdf",
  created_at: "2026-10-02T08:00:00Z",
  project_id: "p1",
  budget_line_id: "bl1",
  cost_center_id: "cc-3200",
  submitted_by: "u-thomas",
  assigned_approver: null,
  partner_id: null,
};

function tables(overrides: Record<string, FakeRow[]> = {}): Record<string, FakeRow[]> {
  return {
    expenses: [standardExpense],
    budget_lines: [
      {
        id: "bl1",
        group_id: "g1",
        allocated_amount: "3000.00",
        consumed_amount: "1500.50",
        obligo_amount: "200.00",
      },
    ],
    projects: [{ id: "p1", code: "BIB-24", name: "Bildungsinitiative" }],
    cost_center_groups: [{ id: "g1", name: "Verpflegung" }],
    cost_center_group_members: [
      { group_id: "g1", cost_center_id: "cc-3200" },
      { group_id: "g1", cost_center_id: "cc-3210" },
      { group_id: "g-other", cost_center_id: "cc-9999" },
    ],
    cost_centers: [
      { id: "cc-3200", code: "3200", name: "Verpflegung" },
      { id: "cc-3210", code: "3210", name: "Getränke" },
      { id: "cc-9999", code: "9999", name: "Fremd" },
    ],
    users: [
      { id: "u-thomas", first_name: "Thomas", last_name: "Meier" },
      { id: "u-katrina", first_name: "Katrina", last_name: "Zuchina" },
    ],
    partners: [],
    approval_logs: [
      {
        id: "l2",
        expense_id: "e1",
        actor_id: "u-katrina",
        action: "approved",
        note: null,
        created_at: "2026-10-03T09:00:00Z",
      },
      {
        id: "l1",
        expense_id: "e1",
        actor_id: "u-thomas",
        action: "submitted",
        note: null,
        created_at: "2026-10-02T08:00:00Z",
      },
      {
        id: "l3",
        expense_id: "e1",
        actor_id: "u-deleted",
        action: "paid",
        note: "Überwiesen",
        created_at: "2026-10-04T09:00:00Z",
      },
      {
        id: "other",
        expense_id: "e2",
        actor_id: "u-thomas",
        action: "submitted",
        note: null,
        created_at: "2026-10-01T08:00:00Z",
      },
    ],
    expense_accounting_details: [{ expense_id: "e1", net_amount: "1260.92", vat_rate: "19" }],
    expense_corrections: [],
    ...overrides,
  };
}

describe("getExpenseDetail", () => {
  it("returns null for an expense that doesn't exist or RLS hides", async () => {
    useTables(tables({ expenses: [] }));
    expect(await getExpenseDetail("e1")).toBeNull();
  });

  it("maps the Belegdaten, with amounts as numbers", async () => {
    useTables(tables());
    const detail = await getExpenseDetail("e1");

    expect(detail).toMatchObject({
      id: "e1",
      status: "paid",
      expenseType: "standard",
      amount: 1500.5,
      reconciledAmount: null,
      vendor: "Bäckerei Schmidt",
      invoiceNumber: "R-2026-17",
      invoiceDate: "2026-10-01",
      accountingNote: "Skonto genutzt",
      documentRef: "BIB-24/0b0e/rechnung.pdf",
      projectCode: "BIB-24",
      projectName: "Bildungsinitiative",
      groupId: "g1",
      groupName: "Verpflegung",
      costCenterCode: "3200",
      costCenterName: "Verpflegung",
      submitterName: "Thomas Meier",
      partnerName: null,
    });
  });

  it("shows the budget line's Soll/Ist/Obligo as the database holds them", async () => {
    useTables(tables());
    expect((await getExpenseDetail("e1"))?.budgetLine).toEqual({
      allocated: 3000,
      consumed: 1500.5,
      obligo: 200,
    });
  });

  it("offers only the cost centers of the expense's own group", async () => {
    useTables(tables());
    const detail = await getExpenseDetail("e1");
    expect(detail?.groupCostCenters.map((c) => c.code).sort()).toEqual(["3200", "3210"]);
  });

  it("lists Verlauf oldest first, with names, and null for an actor the reader can't see", async () => {
    useTables(tables());
    const detail = await getExpenseDetail("e1");
    expect(detail?.logs).toEqual([
      {
        id: "l1",
        actorId: "u-thomas",
        actorName: "Thomas Meier",
        action: "submitted",
        note: null,
        at: "2026-10-02T08:00:00Z",
      },
      {
        id: "l2",
        actorId: "u-katrina",
        actorName: "Katrina Zuchina",
        action: "approved",
        note: null,
        at: "2026-10-03T09:00:00Z",
      },
      {
        id: "l3",
        actorId: "u-deleted",
        actorName: null,
        action: "paid",
        note: "Überwiesen",
        at: "2026-10-04T09:00:00Z",
      },
    ]);
  });

  it("shows payment details as numbers, keeping a missing net amount as null", async () => {
    useTables(
      tables({
        expense_accounting_details: [{ expense_id: "e1", net_amount: null, vat_rate: "7" }],
      }),
    );
    expect((await getExpenseDetail("e1"))?.paymentDetails).toEqual({ netAmount: null, vatRate: 7 });
  });

  it("shows no payment details to a reader RLS keeps out of expense_accounting_details", async () => {
    useTables(tables({ expense_accounting_details: [] }));
    expect((await getExpenseDetail("e1"))?.paymentDetails).toBeNull();
  });

  it("degrades to nulls when the budget line, project or submitter can't be read", async () => {
    useTables(tables({ budget_lines: [], projects: [], users: [], cost_center_groups: [] }));
    const detail = await getExpenseDetail("e1");
    expect(detail).toMatchObject({
      budgetLine: null,
      groupId: "",
      groupName: null,
      groupCostCenters: [],
      projectCode: null,
      projectName: null,
      submitterName: null,
    });
  });

  it("lists corrections oldest first, old values kept as null where there were none", async () => {
    useTables(
      tables({
        expense_corrections: [
          {
            id: "c2",
            expense_id: "e1",
            corrected_at: "2026-10-12T10:00:00Z",
            corrected_by: "u-katrina",
            reason: "Gutschrift",
            document_ref: "BIB-24/u2/gutschrift.pdf",
            old_amount: "1600.00",
            new_amount: "1500.50",
            old_net_amount: "1344.54",
            new_net_amount: "1260.92",
            old_vat_rate: "19",
            new_vat_rate: "19",
            old_invoice_number: "R-2026-17",
            new_invoice_number: "R-2026-17",
            old_invoice_date: "2026-10-01",
            new_invoice_date: "2026-10-01",
          },
          {
            id: "c1",
            expense_id: "e1",
            corrected_at: "2026-10-10T10:00:00Z",
            corrected_by: "u-katrina",
            reason: "Tippfehler",
            document_ref: "BIB-24/u1/korrektur.pdf",
            old_amount: "1500.00",
            new_amount: "1600.00",
            old_net_amount: null,
            new_net_amount: "1344.54",
            old_vat_rate: null,
            new_vat_rate: "19",
            old_invoice_number: null,
            new_invoice_number: "R-2026-17",
            old_invoice_date: null,
            new_invoice_date: "2026-10-01",
          },
        ],
      }),
    );
    const corrections = (await getExpenseDetail("e1"))?.corrections ?? [];
    expect(corrections.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(corrections[0]).toMatchObject({
      correctedByName: "Katrina Zuchina",
      oldAmount: 1500,
      newAmount: 1600,
      oldNetAmount: null,
      newNetAmount: 1344.54,
      oldVatRate: null,
      newVatRate: 19,
    });
  });

  describe("partner advance", () => {
    const advance: FakeRow = {
      ...standardExpense,
      id: "adv",
      expense_type: "partner_advance",
      status: "reconciled",
      amount: "2000.00",
      reconciled_amount: "1750.40",
      vendor_name: null,
      invoice_number: null,
      invoice_date: null,
      cost_center_id: null,
      partner_id: "partner-1",
    };

    function advanceTables() {
      return tables({
        expenses: [
          advance,
          {
            id: "line-1",
            reconciles_advance_id: "adv",
            description: "Saalmiete",
            amount: "1190.00",
            cost_center_id: "cc-3200",
          },
          {
            id: "line-2",
            reconciles_advance_id: "adv",
            description: "Fahrtkosten",
            amount: "560.40",
            cost_center_id: null,
          },
          {
            id: "unrelated",
            reconciles_advance_id: "other-adv",
            description: "Fremd",
            amount: "1.00",
            cost_center_id: null,
          },
        ],
        partners: [{ id: "partner-1", name: "Kulturverein Halle" }],
        expense_accounting_details: [
          { expense_id: "line-1", net_amount: "1000.00", vat_rate: "19" },
        ],
        approval_logs: [],
      });
    }

    it("shows the partner and the reconciled amount", async () => {
      useTables(advanceTables());
      expect(await getExpenseDetail("adv")).toMatchObject({
        expenseType: "partner_advance",
        partnerName: "Kulturverein Halle",
        amount: 2000,
        reconciledAmount: 1750.4,
        costCenterCode: null,
      });
    });

    it("lists a reconciled advance's own line items with their booked figures", async () => {
      useTables(advanceTables());
      expect((await getExpenseDetail("adv"))?.reconciledLines).toEqual([
        {
          id: "line-1",
          costCenterCode: "3200",
          costCenterName: "Verpflegung",
          description: "Saalmiete",
          netAmount: 1000,
          vatRate: 19,
          grossAmount: 1190,
        },
        {
          id: "line-2",
          costCenterCode: null,
          costCenterName: null,
          description: "Fahrtkosten",
          netAmount: 0,
          vatRate: 0,
          grossAmount: 560.4,
        },
      ]);
    });

    // KNOWN BUG: expense-detail.ts:338-339 shows a line item's Netto and
    // MwSt as 0 when its expense_accounting_details row can't be read. RLS
    // lets only Accounting, CEO and Admin read that table (d4u_backend
    // 0001_rls_policies.sql), so a Project or Finance Manager opening their
    // own reconciled advance sees "0,00 €" and "0%" on every line — a
    // confident wrong figure. paymentDetails in the same file uses null for
    // exactly this case; the spec asks for "—" rather than a misleading zero.
    it.fails("shows unreadable booked figures as unknown, not as 0", async () => {
      useTables({ ...advanceTables(), expense_accounting_details: [] });
      const [line] = (await getExpenseDetail("adv"))?.reconciledLines ?? [];
      expect(line.netAmount).toBeNull();
      expect(line.vatRate).toBeNull();
    });

    it("doesn't read line items before the advance is reconciled", async () => {
      const t = advanceTables();
      t.expenses[0] = { ...advance, status: "reconciliation_submitted", reconciled_amount: null };
      const fake = useTables(t);
      const detail = await getExpenseDetail("adv");
      expect(detail?.reconciledLines).toEqual([]);
      expect(detail?.reconciledAmount).toBeNull();
      expect(
        fake
          .queriesOn("expenses")
          .some((q) => q.filters.some((f) => f.column === "reconciles_advance_id")),
      ).toBe(false);
    });
  });
});
