import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type FakeRow } from "./helpers/fake-supabase";

// Auswertung's read mappers (src/lib/supabase/queries/visualization.ts),
// run against an in-memory stand-in for the RLS-scoped Supabase reads.
// Pinned: Soll/Ist/Obligo are only the budget_lines columns the RPCs wrote,
// added up per project or group for display (numerics arrive as strings),
// never re-derived from expenses; the counts and the Vorschuss-Übersicht
// read status the way CONTRIBUTING describes; and the Belege-Übersicht's
// filters and derived columns (Wartet seit, Vorschuss, accounting fields).

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const { createClient } = await import("@/lib/supabase/server");
const {
  getAdvanceOverview,
  getExpenseOverview,
  getProjectDrilldown,
  getVisualizationOverview,
  parseExpenseOverviewFilters,
} = await import("@/lib/supabase/queries/visualization");

function useTables(tables: Record<string, FakeRow[]>, options?: { failingTables?: string[] }) {
  const fake = createFakeSupabase(tables, options);
  vi.mocked(createClient).mockResolvedValue(fake.client as never);
  return fake;
}

beforeEach(() => {
  vi.mocked(createClient).mockReset();
});

describe("getVisualizationOverview", () => {
  it("adds up each project's budget lines as Soll/Ist/Obligo, from the numeric strings", async () => {
    useTables({
      projects: [
        { id: "p1", code: "BIB-24", name: "Bildung", lead_user_id: "u1" },
        { id: "p2", code: "ABC-1", name: "Austausch", lead_user_id: null },
      ],
      budget_lines: [
        {
          project_id: "p1",
          allocated_amount: "10000.00",
          consumed_amount: "2500.50",
          obligo_amount: "1000.00",
        },
        {
          project_id: "p1",
          allocated_amount: "5000.00",
          consumed_amount: "0.00",
          obligo_amount: "250.25",
        },
        {
          project_id: "p2",
          allocated_amount: "800.00",
          consumed_amount: "800.00",
          obligo_amount: "0.00",
        },
      ],
      expenses: [],
    });

    const overview = await getVisualizationOverview();

    expect(overview.statusByProject).toEqual({
      p1: { soll: 15000, ist: 2500.5, obligo: 1250.25 },
      p2: { soll: 800, ist: 800, obligo: 0 },
    });
    expect(overview.projects).toEqual([
      { id: "p2", code: "ABC-1", name: "Austausch", leadUserId: null },
      { id: "p1", code: "BIB-24", name: "Bildung", leadUserId: "u1" },
    ]);
  });

  it("leaves a project without budget lines out of the figures, rather than inventing zeros", async () => {
    useTables({
      projects: [{ id: "p1", code: "BIB-24", name: "Bildung", lead_user_id: null }],
      budget_lines: [],
      expenses: [],
    });
    expect((await getVisualizationOverview()).statusByProject).toEqual({});
  });

  it("counts Belege waiting for a review stage as 'in Prüfung', nothing else", async () => {
    const statuses = [
      "submitted",
      "ceo_approval",
      "accounting_approval",
      "accounting_approval",
      "needs_changes",
      "awaiting_payment",
      "paid",
      "awaiting_receipt",
      "submitted_unverified",
      "reconciled",
    ];
    useTables({ projects: [], budget_lines: [], expenses: statuses.map((status) => ({ status })) });

    expect((await getVisualizationOverview()).pendingCount).toBe(4);
  });

  it("counts a placeholder advance as an open Vorschuss", async () => {
    useTables({
      projects: [],
      budget_lines: [],
      expenses: [{ status: "submitted_unverified" }, { status: "reconciled" }, { status: "paid" }],
    });
    expect((await getVisualizationOverview()).openAdvancesCount).toBe(1);
  });

  // An advance stays open until Accounting reconciled it, split or not
  // (decided 19 Oct 2026; OPEN_ADVANCE_STATUSES, shared with the
  // submitter's own list on the Vorschüsse tab).
  it("counts a split advance and one awaiting Accounting as open too", async () => {
    useTables({
      projects: [],
      budget_lines: [],
      expenses: [
        { status: "submitted_unverified" },
        { status: "reconciliation_in_progress" },
        { status: "reconciliation_submitted" },
        { status: "reconciled" },
      ],
    });
    expect((await getVisualizationOverview()).openAdvancesCount).toBe(3);
  });
});

describe("getAdvanceOverview (Vorschuss-Übersicht)", () => {
  const partners = [{ id: "partner-1", name: "Kulturverein Halle" }];

  it("lists open and reconciled partner advances, newest change first, nothing else", async () => {
    const fake = useTables({
      expenses: [
        {
          id: "open",
          expense_type: "partner_advance",
          partner_id: "partner-1",
          amount: "1500.00",
          reconciled_amount: null,
          status: "submitted_unverified",
          updated_at: "2026-10-01T09:00:00Z",
        },
        {
          id: "done",
          expense_type: "partner_advance",
          partner_id: "partner-1",
          amount: "2000.00",
          reconciled_amount: "1750.40",
          status: "reconciled",
          updated_at: "2026-10-10T09:00:00Z",
        },
        {
          id: "standard",
          expense_type: "standard",
          partner_id: null,
          amount: "99.00",
          reconciled_amount: null,
          status: "paid",
          updated_at: "2026-10-11T09:00:00Z",
        },
      ],
      partners,
    });

    const rows = await getAdvanceOverview();

    expect(rows).toEqual([
      {
        id: "done",
        partnerName: "Kulturverein Halle",
        amount: 2000,
        reconciledAmount: 1750.4,
        status: "reconciled",
        reconciledAt: "2026-10-10T09:00:00Z",
      },
      {
        id: "open",
        partnerName: "Kulturverein Halle",
        amount: 1500,
        reconciledAmount: null,
        status: "submitted_unverified",
        reconciledAt: null,
      },
    ]);
    expect(fake.queriesOn("expenses")[0].filters).toContainEqual({
      operator: "eq",
      column: "expense_type",
      value: "partner_advance",
    });
  });

  it("keeps a reconciled amount of 0 as 0, not as 'not reconciled'", async () => {
    useTables({
      expenses: [
        {
          id: "a",
          expense_type: "partner_advance",
          partner_id: "partner-1",
          amount: "500.00",
          reconciled_amount: "0.00",
          status: "reconciled",
          updated_at: "2026-10-10T09:00:00Z",
        },
      ],
      partners,
    });
    expect((await getAdvanceOverview())[0].reconciledAmount).toBe(0);
  });

  it("shows '—' for an advance without a partner, or one RLS doesn't let the reader see", async () => {
    const fake = useTables({
      expenses: [
        {
          id: "no-partner",
          expense_type: "partner_advance",
          partner_id: null,
          amount: "1",
          reconciled_amount: null,
          status: "submitted_unverified",
          updated_at: "2026-10-02T00:00:00Z",
        },
        {
          id: "hidden",
          expense_type: "partner_advance",
          partner_id: "partner-unknown",
          amount: "1",
          reconciled_amount: null,
          status: "submitted_unverified",
          updated_at: "2026-10-01T00:00:00Z",
        },
      ],
      partners,
    });

    expect((await getAdvanceOverview()).map((r) => r.partnerName)).toEqual(["—", "—"]);
    expect(fake.queriesOn("partners")[0].filters).toEqual([
      { operator: "in", column: "id", value: ["partner-unknown"] },
    ]);
  });

  it("doesn't query partners when no advance names one", async () => {
    const fake = useTables({ expenses: [], partners });
    expect(await getAdvanceOverview()).toEqual([]);
    expect(fake.queriesOn("partners")).toEqual([]);
  });

  // KNOWN BUG: visualization.ts:127 shows updated_at as "Abgerechnet am".
  // updated_at moves on every later write to the row — d4u_backend's
  // accounting-note route sets it, and Accounting may edit the
  // Buchhaltungsnotiz in any status — so the date shifts to the last note
  // edit. The reconcile commit logs to_status "reconciled" in
  // approval_logs; that entry is when it was reconciled.
  it.fails("shows when the advance was reconciled, not when the row last changed", async () => {
    useTables({
      expenses: [
        {
          id: "a",
          expense_type: "partner_advance",
          partner_id: "partner-1",
          amount: "2000.00",
          reconciled_amount: "1750.40",
          status: "reconciled",
          updated_at: "2026-10-18T15:00:00Z",
          approval_logs: [{ to_status: "reconciled", created_at: "2026-10-10T09:00:00Z" }],
        },
      ],
      approval_logs: [
        { expense_id: "a", to_status: "reconciled", created_at: "2026-10-10T09:00:00Z" },
      ],
      partners,
    });
    expect((await getAdvanceOverview())[0].reconciledAt).toBe("2026-10-10T09:00:00Z");
  });
});

describe("getProjectDrilldown", () => {
  const tables = () => ({
    projects: [{ id: "p1", code: "BIB-24", name: "Bildung", lead_user_id: "u1" }],
    cost_center_groups: [
      { id: "g-catering", project_id: "p1", name: "Verpflegung" },
      { id: "g-travel", project_id: "p1", name: "Reisen" },
      { id: "g-unbudgeted", project_id: "p1", name: "Sonstiges" },
      { id: "g-other-project", project_id: "p2", name: "Fremd" },
    ],
    budget_lines: [
      {
        project_id: "p1",
        group_id: "g-catering",
        allocated_amount: "3000.00",
        consumed_amount: "1200.10",
        obligo_amount: "300.00",
        warning_threshold_pct: "90",
      },
      {
        project_id: "p1",
        group_id: "g-travel",
        allocated_amount: "2000.00",
        consumed_amount: "0.00",
        obligo_amount: "450.50",
        warning_threshold_pct: "75",
      },
      {
        project_id: "p2",
        group_id: "g-other-project",
        allocated_amount: "9999.00",
        consumed_amount: "9999.00",
        obligo_amount: "0.00",
        warning_threshold_pct: "80",
      },
    ],
    cost_center_group_members: [
      { group_id: "g-catering", cost_center_id: "cc-3200" },
      { group_id: "g-catering", cost_center_id: "cc-gone" },
      { group_id: "g-travel", cost_center_id: "cc-4100" },
    ],
    cost_centers: [
      { id: "cc-3200", code: "3200", name: "Verpflegung" },
      { id: "cc-4100", code: "4100", name: "Reisekosten" },
    ],
  });

  it("shows each group's own budget line, and the project total as their sum", async () => {
    useTables(tables());
    const drilldown = await getProjectDrilldown("p1");

    expect(drilldown.project).toEqual({
      id: "p1",
      code: "BIB-24",
      name: "Bildung",
      leadUserId: "u1",
    });
    expect(drilldown.groups.map((g) => [g.id, g.status, g.warningThresholdPct])).toEqual([
      ["g-catering", { soll: 3000, ist: 1200.1, obligo: 300 }, 90],
      ["g-travel", { soll: 2000, ist: 0, obligo: 450.5 }, 75],
      ["g-unbudgeted", { soll: 0, ist: 0, obligo: 0 }, 80],
    ]);
    expect(drilldown.total.soll).toBe(5000);
    expect(drilldown.total.ist).toBeCloseTo(1200.1, 10);
    expect(drilldown.total.obligo).toBeCloseTo(750.5, 10);
  });

  it("lists each group's cost centers, skipping ones the reader can't see", async () => {
    useTables(tables());
    const { groups } = await getProjectDrilldown("p1");
    expect(groups.find((g) => g.id === "g-catering")?.costCenters).toEqual([
      { id: "cc-3200", code: "3200", name: "Verpflegung" },
    ]);
    expect(groups.find((g) => g.id === "g-unbudgeted")?.costCenters).toEqual([]);
  });

  it("returns no project and no groups for a project RLS hides or that doesn't exist", async () => {
    useTables(tables());
    expect(await getProjectDrilldown("p-hidden")).toEqual({
      project: null,
      total: { soll: 0, ist: 0, obligo: 0 },
      groups: [],
    });
  });
});

describe("parseExpenseOverviewFilters", () => {
  it("keeps known values and drops anything else from the URL", () => {
    expect(
      parseExpenseOverviewFilters({
        status: "paid",
        responsible: "accounting",
        costCenter: "cc-1",
        expenseProject: "p1",
        from: "2026-10-01",
        to: "2026-10-31",
      }),
    ).toEqual({
      status: "paid",
      responsibleParty: "accounting",
      costCenterId: "cc-1",
      projectId: "p1",
      from: "2026-10-01",
      to: "2026-10-31",
    });

    expect(
      parseExpenseOverviewFilters({ status: "draft", responsible: "admin", costCenter: "" }),
    ).toEqual({
      status: undefined,
      responsibleParty: undefined,
      costCenterId: undefined,
      projectId: undefined,
      from: undefined,
      to: undefined,
    });
  });

  it("accepts 'all' to include closed Belege", () => {
    expect(parseExpenseOverviewFilters({ status: "all" }).status).toBe("all");
  });
});

describe("getExpenseOverview (Belege-Übersicht)", () => {
  function expense(overrides: FakeRow): FakeRow {
    return {
      id: "e1",
      project_id: "p1",
      cost_center_id: "cc-3200",
      status: "accounting_approval",
      submitted_by: "u1",
      amount: "1500.50",
      description: "Catering Fachtag",
      vendor_name: "Bäckerei Schmidt",
      invoice_number: "R-1",
      invoice_date: "2026-10-01",
      paid_at: null,
      document_ref: "BIB-24/uuid/r.pdf",
      receipt_status: "attached",
      accounting_note: null,
      expense_type: "standard",
      created_at: "2026-10-05T10:00:00Z",
      reconciles_advance_id: null,
      approval_logs: [],
      expense_accounting_details: null,
      ...overrides,
    };
  }

  const lookups = {
    projects: [{ id: "p1", code: "BIB-24", name: "Bildung" }],
    cost_centers: [{ id: "cc-3200", code: "3200", name: "Verpflegung" }],
    users: [{ id: "u1", first_name: "Thomas", last_name: "Meier" }],
  };

  it("maps a row with its project, cost center, submitter and amount as a number", async () => {
    useTables({ ...lookups, expenses: [expense({})] });
    const [row] = await getExpenseOverview();

    expect(row).toMatchObject({
      id: "e1",
      projectCode: "BIB-24",
      projectName: "Bildung",
      costCenterCode: "3200",
      costCenterName: "Verpflegung",
      submittedByName: "Thomas Meier",
      amount: 1500.5,
      accounting: null,
      parentAdvanceDescription: null,
    });
  });

  // "Beleg fehlt" badge (D4U, 19 Oct 2026: a receipt may be added later).
  it("carries the receipt status, so a missing receipt can be flagged", async () => {
    useTables({
      ...lookups,
      expenses: [
        expense({ id: "with", receipt_status: "attached" }),
        expense({ id: "without", document_ref: null, receipt_status: "missing" }),
      ],
    });
    const rows = await getExpenseOverview();

    expect(Object.fromEntries(rows.map((row) => [row.id, row.receiptStatus]))).toEqual({
      with: "attached",
      without: "missing",
    });
  });

  it("shows '—' and null for lookups the reader can't see", async () => {
    useTables({
      projects: [],
      cost_centers: [],
      users: [],
      expenses: [expense({ cost_center_id: null })],
    });
    const [row] = await getExpenseOverview();
    expect(row).toMatchObject({
      projectCode: "—",
      projectName: "—",
      costCenterCode: null,
      costCenterName: null,
      submittedByName: null,
    });
  });

  it("shows only open Belege by default, and every status for 'all'", async () => {
    const tables = {
      ...lookups,
      expenses: [
        expense({ id: "open", status: "awaiting_payment" }),
        expense({ id: "paid", status: "paid" }),
        expense({ id: "reconciled", status: "reconciled" }),
      ],
    };
    useTables(tables);
    expect((await getExpenseOverview()).map((r) => r.id)).toEqual(["open"]);

    useTables(tables);
    expect((await getExpenseOverview({ status: "all" })).map((r) => r.id).sort()).toEqual([
      "open",
      "paid",
      "reconciled",
    ]);
  });

  it("narrows to the statuses the chosen party is responsible for", async () => {
    useTables({
      ...lookups,
      expenses: [
        expense({ id: "ceo", status: "ceo_approval" }),
        expense({ id: "accounting", status: "accounting_approval" }),
        expense({ id: "submitter", status: "needs_changes" }),
      ],
    });
    expect((await getExpenseOverview({ responsibleParty: "ceo" })).map((r) => r.id)).toEqual([
      "ceo",
    ]);
  });

  it("runs no query when status and responsible party can't both hold", async () => {
    const fake = useTables({ ...lookups, expenses: [expense({ status: "paid" })] });
    expect(await getExpenseOverview({ status: "paid", responsibleParty: "ceo" })).toEqual([]);
    expect(fake.queries).toEqual([]);
  });

  it("includes the whole 'to' day", async () => {
    useTables({
      ...lookups,
      expenses: [
        expense({ id: "morning", created_at: "2026-10-05T06:00:00Z" }),
        expense({ id: "evening", created_at: "2026-10-05T21:30:00Z" }),
        expense({ id: "next-day", created_at: "2026-10-06T08:00:00Z" }),
      ],
    });
    const ids = (await getExpenseOverview({ from: "2026-10-05", to: "2026-10-05" })).map(
      (r) => r.id,
    );
    expect(ids.sort()).toEqual(["evening", "morning"]);
  });

  // KNOWN BUG: visualization.ts:321-322 filters created_at against bare
  // dates, which Postgres reads in the session time zone (UTC), while the
  // screen and the export show dates in Europe/Berlin (mock-data.ts,
  // DISPLAY_TIME_ZONE). A Beleg submitted 00:30 Berlin time on 13 Oct is
  // shown as 13.10.2026 but left out of "von 13.10." and counted in
  // "bis 12.10." instead.
  it.fails("reads the date range as Berlin calendar days, like the dates on screen", async () => {
    useTables({
      ...lookups,
      expenses: [expense({ id: "just-after-midnight", created_at: "2026-10-12T22:30:00Z" })],
    });
    expect((await getExpenseOverview({ from: "2026-10-13" })).map((r) => r.id)).toEqual([
      "just-after-midnight",
    ]);
    useTables({
      ...lookups,
      expenses: [expense({ id: "just-after-midnight", created_at: "2026-10-12T22:30:00Z" })],
    });
    expect(await getExpenseOverview({ to: "2026-10-12" })).toEqual([]);
  });

  it("dates 'Wartet seit' from the latest log entry into the current status", async () => {
    useTables({
      ...lookups,
      expenses: [
        expense({
          status: "accounting_approval",
          approval_logs: [
            { to_status: "ceo_approval", created_at: "2026-10-05T10:00:00Z" },
            { to_status: "accounting_approval", created_at: "2026-10-06T10:00:00Z" },
            { to_status: "needs_changes", created_at: "2026-10-07T10:00:00Z" },
            { to_status: "accounting_approval", created_at: "2026-10-09T10:00:00Z" },
            { to_status: null, created_at: "2026-10-10T10:00:00Z" },
          ],
        }),
      ],
    });
    expect((await getExpenseOverview())[0].statusSince).toBe("2026-10-09T10:00:00Z");
  });

  it("falls back to the latest status change, then to creation", async () => {
    useTables({
      ...lookups,
      expenses: [
        expense({
          id: "moved-without-matching-log",
          status: "awaiting_payment",
          approval_logs: [
            { to_status: "accounting_approval", created_at: "2026-10-06T10:00:00Z" },
            { to_status: null, created_at: "2026-10-08T10:00:00Z" },
          ],
        }),
        expense({
          id: "split-line",
          status: "awaiting_receipt",
          created_at: "2026-10-04T08:00:00Z",
          approval_logs: [{ to_status: null, created_at: "2026-10-08T10:00:00Z" }],
        }),
      ],
    });
    const rows = await getExpenseOverview();
    expect(rows.find((r) => r.id === "moved-without-matching-log")?.statusSince).toBe(
      "2026-10-06T10:00:00Z",
    );
    expect(rows.find((r) => r.id === "split-line")?.statusSince).toBe("2026-10-04T08:00:00Z");
  });

  it("names a line item's advance, from the result or from a separate lookup", async () => {
    useTables({
      ...lookups,
      expenses: [
        expense({
          id: "advance-shown",
          status: "reconciliation_in_progress",
          description: "Vorschuss Halle",
        }),
        expense({
          id: "line-1",
          status: "awaiting_receipt",
          reconciles_advance_id: "advance-shown",
        }),
        expense({
          id: "line-2",
          status: "awaiting_receipt",
          reconciles_advance_id: "advance-paid",
        }),
        expense({ id: "advance-paid", status: "reconciled", description: "Vorschuss Leipzig" }),
      ],
    });
    const rows = await getExpenseOverview();
    expect(rows.find((r) => r.id === "line-1")?.parentAdvanceDescription).toBe("Vorschuss Halle");
    expect(rows.find((r) => r.id === "line-2")?.parentAdvanceDescription).toBe("Vorschuss Leipzig");
    expect(rows.map((r) => r.id)).not.toContain("advance-paid");
  });

  it("reads the embedded accounting details as one object or a one-row array", async () => {
    const details = {
      booking_key: "4930",
      vat_rate: "19",
      net_amount: "1260.92",
      ksk_liable: false,
      supplier_vat_id: null,
      supplier_address: "Hauptstr. 1",
      supplier_bank_name: null,
    };
    useTables({
      ...lookups,
      expenses: [
        expense({ id: "object", expense_accounting_details: details }),
        expense({ id: "array", expense_accounting_details: [details] }),
        expense({ id: "empty", expense_accounting_details: [] }),
      ],
    });
    const rows = await getExpenseOverview();
    const expected = {
      bookingKey: "4930",
      vatRate: 19,
      netAmount: 1260.92,
      kskLiable: false,
      supplierVatId: null,
      supplierAddress: "Hauptstr. 1",
      supplierBankName: null,
    };
    expect(rows.find((r) => r.id === "object")?.accounting).toEqual(expected);
    expect(rows.find((r) => r.id === "array")?.accounting).toEqual(expected);
    expect(rows.find((r) => r.id === "empty")?.accounting).toBeNull();
  });

  it("raises a failed read instead of showing an empty, falsely complete list", async () => {
    useTables({ ...lookups, expenses: [expense({})] }, { failingTables: ["expenses"] });
    await expect(getExpenseOverview()).rejects.toEqual({ message: "query failed" });
  });
});
