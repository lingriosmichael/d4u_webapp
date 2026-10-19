import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type FakeRow } from "./helpers/fake-supabase";

// The Vorschüsse tab's reads (src/lib/supabase/queries/advances.ts).
// Pinned: which advances each list shows (a submitter's own unsettled
// ones; Accounting's queue of handed-off ones), the receipt progress
// counted from each advance's own line items, and the detail's line items
// with their accounting fields as numbers or null — never a made-up 0.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const { createClient } = await import("@/lib/supabase/server");
const { getAdvanceReconciliationDetail, getAdvancesAwaitingConfirmation, getMyOpenAdvances } =
  await import("@/lib/supabase/queries/advances");

function useTables(tables: Record<string, FakeRow[]>) {
  const fake = createFakeSupabase(tables);
  vi.mocked(createClient).mockResolvedValue(fake.client as never);
  return fake;
}

beforeEach(() => {
  vi.mocked(createClient).mockReset();
});

function advance(overrides: FakeRow): FakeRow {
  return {
    id: "adv",
    expense_type: "partner_advance",
    status: "submitted_unverified",
    amount: "2000.00",
    description: "Vorschuss Halle",
    created_at: "2026-10-01T08:00:00Z",
    updated_at: "2026-10-01T08:00:00Z",
    project_id: "p1",
    partner_id: "partner-1",
    submitted_by: "u-me",
    budget_line_id: "bl1",
    reconciles_advance_id: null,
    ...overrides,
  };
}

const lookups = {
  projects: [{ id: "p1", code: "BIB-24", name: "Bildungsinitiative" }],
  partners: [{ id: "partner-1", name: "Kulturverein Halle" }],
  users: [
    { id: "u-me", first_name: "Thomas", last_name: "Meier" },
    { id: "u-other", first_name: "Anna", last_name: "Schulz" },
  ],
};

describe("getMyOpenAdvances", () => {
  it("lists the user's own advances that are not yet reconciled, newest first", async () => {
    useTables({
      ...lookups,
      expenses: [
        advance({
          id: "placeholder",
          status: "submitted_unverified",
          created_at: "2026-10-01T08:00:00Z",
        }),
        advance({
          id: "split",
          status: "reconciliation_in_progress",
          created_at: "2026-10-03T08:00:00Z",
        }),
        advance({
          id: "handed-off",
          status: "reconciliation_submitted",
          created_at: "2026-10-02T08:00:00Z",
        }),
        advance({ id: "settled", status: "reconciled" }),
        advance({ id: "someone-elses", submitted_by: "u-other" }),
        advance({ id: "standard", expense_type: "standard", status: "submitted" }),
      ],
    });

    expect((await getMyOpenAdvances("u-me")).map((a) => a.id)).toEqual([
      "split",
      "handed-off",
      "placeholder",
    ]);
  });

  it("counts each advance's own line items and those with a receipt attached", async () => {
    useTables({
      ...lookups,
      expenses: [
        advance({ id: "adv", status: "reconciliation_in_progress" }),
        advance({ id: "adv-2", status: "reconciliation_in_progress" }),
        { id: "l1", reconciles_advance_id: "adv", receipt_status: "attached" },
        { id: "l2", reconciles_advance_id: "adv", receipt_status: "missing" },
        { id: "l3", reconciles_advance_id: "adv", receipt_status: "attached" },
        { id: "l4", reconciles_advance_id: "adv-2", receipt_status: "not_required" },
      ],
    });

    const summaries = await getMyOpenAdvances("u-me");
    expect(summaries.find((s) => s.id === "adv")).toMatchObject({
      childCount: 3,
      childrenWithReceiptCount: 2,
    });
    expect(summaries.find((s) => s.id === "adv-2")).toMatchObject({
      childCount: 1,
      childrenWithReceiptCount: 0,
    });
  });

  it("maps names and the amount, with null for what the reader can't see", async () => {
    useTables({
      projects: [],
      partners: [],
      users: [{ id: "u-me", first_name: "Thomas", last_name: "Meier" }],
      expenses: [advance({ partner_id: null })],
    });

    expect(await getMyOpenAdvances("u-me")).toEqual([
      {
        id: "adv",
        status: "submitted_unverified",
        amount: 2000,
        description: "Vorschuss Halle",
        createdAt: "2026-10-01T08:00:00Z",
        projectName: null,
        partnerName: null,
        submitterName: "Thomas Meier",
        childCount: 0,
        childrenWithReceiptCount: 0,
      },
    ]);
  });

  it("returns an empty list without further reads when there is nothing open", async () => {
    const fake = useTables({ ...lookups, expenses: [] });
    expect(await getMyOpenAdvances("u-me")).toEqual([]);
    expect(fake.queries.map((q) => q.table)).toEqual(["expenses"]);
  });
});

describe("getAdvancesAwaitingConfirmation", () => {
  it("lists every submitter's handed-off advances, the longest-waiting first", async () => {
    useTables({
      ...lookups,
      expenses: [
        advance({
          id: "newer",
          status: "reconciliation_submitted",
          updated_at: "2026-10-09T08:00:00Z",
        }),
        advance({
          id: "older",
          status: "reconciliation_submitted",
          updated_at: "2026-10-05T08:00:00Z",
          submitted_by: "u-other",
        }),
        advance({ id: "still-splitting", status: "reconciliation_in_progress" }),
        advance({ id: "settled", status: "reconciled" }),
      ],
    });

    const queue = await getAdvancesAwaitingConfirmation();
    expect(queue.map((a) => [a.id, a.submitterName])).toEqual([
      ["older", "Anna Schulz"],
      ["newer", "Thomas Meier"],
    ]);
  });
});

describe("getAdvanceReconciliationDetail", () => {
  const detailTables = () => ({
    ...lookups,
    budget_lines: [{ id: "bl1", group_id: "g1" }],
    cost_center_group_members: [
      { group_id: "g1", cost_center_id: "cc-3200" },
      { group_id: "g-other", cost_center_id: "cc-9999" },
    ],
    cost_centers: [
      { id: "cc-3200", code: "3200", name: "Verpflegung" },
      { id: "cc-9999", code: "9999", name: "Fremd" },
    ],
    expenses: [
      advance({ status: "reconciliation_in_progress" }),
      {
        id: "line-2",
        reconciles_advance_id: "adv",
        status: "awaiting_receipt",
        description: "Fahrtkosten",
        amount: "560.40",
        receipt_status: "missing",
        document_ref: null,
        cost_center_id: null,
        created_at: "2026-10-04T09:00:00Z",
      },
      {
        id: "line-1",
        reconciles_advance_id: "adv",
        status: "awaiting_receipt",
        description: "Saalmiete",
        amount: "1190.00",
        receipt_status: "attached",
        document_ref: "BIB-24/u1/saal.pdf",
        cost_center_id: "cc-3200",
        created_at: "2026-10-04T08:00:00Z",
      },
    ],
    expense_accounting_details: [
      {
        expense_id: "line-1",
        local_amount: "1190.00",
        exchange_rate: "1",
        booking_key: "4210",
        vat_rate: "19",
        net_amount: "1000.00",
        ksk_liable: false,
      },
    ],
  });

  it("returns null for anything that isn't a partner advance the reader can see", async () => {
    useTables({ ...detailTables(), expenses: [advance({ expense_type: "standard" })] });
    expect(await getAdvanceReconciliationDetail("adv")).toBeNull();

    useTables({ ...detailTables(), expenses: [] });
    expect(await getAdvanceReconciliationDetail("adv")).toBeNull();
  });

  it("maps the advance and its group's cost centers", async () => {
    useTables(detailTables());
    const detail = await getAdvanceReconciliationDetail("adv");
    expect(detail).toMatchObject({
      id: "adv",
      status: "reconciliation_in_progress",
      amount: 2000,
      submittedBy: "u-me",
      projectName: "Bildungsinitiative",
      projectCode: "BIB-24",
      budgetLineId: "bl1",
      groupId: "g1",
      partnerName: "Kulturverein Halle",
      groupCostCenters: [{ id: "cc-3200", code: "3200", name: "Verpflegung" }],
    });
  });

  it("lists line items oldest first, accounting fields as numbers, and null where none were entered", async () => {
    useTables(detailTables());
    const detail = await getAdvanceReconciliationDetail("adv");
    expect(detail?.children).toEqual([
      {
        id: "line-1",
        status: "awaiting_receipt",
        description: "Saalmiete",
        amount: 1190,
        receiptStatus: "attached",
        documentRef: "BIB-24/u1/saal.pdf",
        costCenterId: "cc-3200",
        costCenterCode: "3200",
        costCenterName: "Verpflegung",
        localAmount: 1190,
        exchangeRate: 1,
        bookingKey: "4210",
        vatRate: 19,
        netAmount: 1000,
        kskLiable: false,
      },
      {
        id: "line-2",
        status: "awaiting_receipt",
        description: "Fahrtkosten",
        amount: 560.4,
        receiptStatus: "missing",
        documentRef: null,
        costCenterId: null,
        costCenterCode: null,
        costCenterName: null,
        localAmount: null,
        exchangeRate: null,
        bookingKey: null,
        vatRate: null,
        netAmount: null,
        kskLiable: null,
      },
    ]);
  });

  it("keeps a VAT rate of 0 as 0, not as 'not entered'", async () => {
    const t = detailTables();
    t.expense_accounting_details[0] = {
      ...t.expense_accounting_details[0],
      vat_rate: "0",
      ksk_liable: true,
    };
    useTables(t);
    const [line] = (await getAdvanceReconciliationDetail("adv"))?.children ?? [];
    expect(line.vatRate).toBe(0);
    expect(line.kskLiable).toBe(true);
  });

  it("offers no cost centers when the budget line can't be read", async () => {
    const fake = useTables({ ...detailTables(), budget_lines: [] });
    const detail = await getAdvanceReconciliationDetail("adv");
    expect(detail?.groupId).toBe("");
    expect(detail?.groupCostCenters).toEqual([]);
    expect(fake.queriesOn("cost_center_group_members")).toEqual([]);
  });
});
