import { describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { ALL_EXPENSE_STATUSES, OPEN_EXPENSE_STATUSES, type ExpenseStatus } from "@/lib/mock-data";
import { responsibleLabelForStatus } from "@/lib/approval-stage-role";
import type { ExpenseOverviewRow } from "@/lib/supabase/queries/visualization";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const {
  buildExpenseOverviewWorkbook,
  berlinCalendarDate,
  describeExpenseOverviewFilters,
  expenseOverviewFileName,
} = await import("@/lib/expense-overview-export");

function row(overrides: Partial<ExpenseOverviewRow>): ExpenseOverviewRow {
  return {
    id: "7bf3f03a-ade9-4c80-b443-c56897b5ff7e",
    projectId: "p1",
    projectCode: "BIB-24",
    projectName: "Bildungsinitiative Berlin",
    costCenterId: "c1",
    costCenterCode: "3200",
    costCenterName: "Verpflegung",
    status: "accounting_approval",
    responsibleParty: "accounting",
    submittedByName: "Thomas Meier",
    amount: 1500.5,
    description: "Catering Fachtag",
    vendorName: "Bäckerei Schmidt",
    expenseType: "standard",
    createdAt: "2026-10-12T23:30:00Z",
    ...overrides,
  };
}

async function readBack(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  // exceljs's own Buffer typing predates @types/node's generic Buffer; an
  // exact ArrayBuffer copy satisfies both.
  const bytes = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  await workbook.xlsx.load(bytes as ArrayBuffer);
  return workbook;
}

describe("Zuständig", () => {
  it("names someone for every open status except the never-written 'submitted'", () => {
    const unassigned = OPEN_EXPENSE_STATUSES.filter(
      (s) => s !== "submitted" && responsibleLabelForStatus(s) === "—",
    );
    expect(unassigned).toEqual([]);
  });

  it.each<[ExpenseStatus, string]>([
    ["ceo_approval", "Geschäftsführung"],
    ["accounting_approval", "Buchhaltung"],
    ["needs_changes", "Einreicher:in"],
    ["reconciliation_in_progress", "Einreicher:in"],
    ["awaiting_receipt", "Einreicher:in"],
    ["reconciliation_submitted", "Buchhaltung"],
    ["paid", "Abgeschlossen"],
    ["reconciled", "Abgeschlossen"],
  ])("%s → %s", (status, label) => {
    expect(responsibleLabelForStatus(status)).toBe(label);
  });

  it("covers every status the filter bar offers", () => {
    for (const status of ALL_EXPENSE_STATUSES) {
      expect(typeof responsibleLabelForStatus(status)).toBe("string");
    }
  });
});

describe("buildExpenseOverviewWorkbook", () => {
  it("writes one header row and one row per Beleg, with real numbers and dates", async () => {
    const buffer = await buildExpenseOverviewWorkbook({
      rows: [
        row({}),
        row({
          id: "a59d7e60-64b9-4a7b-9d2f-45d9c3782d2f",
          status: "reconciliation_in_progress",
          expenseType: "partner_advance",
          costCenterCode: null,
          costCenterName: null,
          vendorName: null,
          amount: 3,
        }),
      ],
      filters: [["Status", "Offen"]],
      exportedBy: "Katrina Zuchina",
      exportedAt: new Date("2026-10-13T10:40:00Z"),
    });
    const workbook = await readBack(buffer);
    const sheet = workbook.getWorksheet("Belege")!;

    expect(sheet.getRow(1).values).toEqual([
      undefined,
      "Projekt",
      "Projektname",
      "Kostenstelle",
      "Beschreibung",
      "Lieferant / Empfänger",
      "Art",
      "Betrag (EUR)",
      "Status",
      "Zuständig",
      "Eingereicht von",
      "Eingereicht am",
      "Beleg-ID",
    ]);
    expect(sheet.rowCount).toBe(3);

    const first = sheet.getRow(2);
    expect(first.getCell(3).value).toBe("3200 · Verpflegung");
    expect(first.getCell(7).value).toBe(1500.5);
    expect(first.getCell(7).numFmt).toBe('#,##0.00 "€"');
    expect(first.getCell(8).value).toBe("Buchhaltungsprüfung");
    expect(first.getCell(9).value).toBe("Buchhaltung");
    // 23:30 UTC on 12 Oct is already 13 Oct in Berlin — the day the app shows.
    expect((first.getCell(11).value as Date).toISOString()).toBe("2026-10-13T00:00:00.000Z");
    expect(first.getCell(11).numFmt).toBe("dd.mm.yyyy");

    const advance = sheet.getRow(3);
    expect(advance.getCell(3).value).toBeNull();
    expect(advance.getCell(6).value).toBe("Partner-Vorschuss");
    expect(advance.getCell(9).value).toBe("Einreicher:in");
  });

  it("puts who, when, how many, the total and the filters on the Info sheet", async () => {
    const buffer = await buildExpenseOverviewWorkbook({
      rows: [row({ amount: 10 }), row({ amount: 2.5 })],
      filters: [
        ["Status", "Alle"],
        ["Projekt", "BIB-24 · Bildungsinitiative Berlin"],
      ],
      exportedBy: "Katrina Zuchina",
      exportedAt: new Date("2026-10-13T10:40:00Z"),
    });
    const info = (await readBack(buffer)).getWorksheet("Info")!;
    const values = new Map<string, unknown>();
    info.eachRow((r) => values.set(String(r.getCell(1).value), r.getCell(2).value));

    expect(values.get("Exportiert am")).toBe("13.10.2026, 12:40");
    expect(values.get("Exportiert von")).toBe("Katrina Zuchina");
    expect(values.get("Anzahl Belege")).toBe(2);
    expect(values.get("Summe Betrag (EUR)")).toMatchObject({
      formula: "SUM(Belege!G2:G3)",
      result: 12.5,
    });
    expect(values.get("Projekt")).toBe("BIB-24 · Bildungsinitiative Berlin");
  });

  it("still produces a valid file with no rows", async () => {
    const buffer = await buildExpenseOverviewWorkbook({
      rows: [],
      filters: [],
      exportedBy: "Katrina Zuchina",
      exportedAt: new Date("2026-10-13T10:40:00Z"),
    });
    const workbook = await readBack(buffer);
    expect(workbook.getWorksheet("Belege")!.rowCount).toBe(1);
  });
});

describe("helpers", () => {
  it("dates the file name in Berlin time", () => {
    expect(expenseOverviewFileName(new Date("2026-10-12T22:30:00Z"))).toBe(
      "D4U_Belege_2026-10-13.xlsx",
    );
  });

  it("keeps the Berlin calendar day", () => {
    expect(berlinCalendarDate("2026-03-29T00:30:00Z").toISOString()).toBe(
      "2026-03-29T00:00:00.000Z",
    );
  });

  it("describes filters in the filter bar's words", () => {
    const described = describeExpenseOverviewFilters(
      { responsibleParty: "submitter", projectId: "p1", from: "2026-10-01" },
      {
        projects: [{ id: "p1", code: "BIB-24", name: "Bildungsinitiative Berlin" }],
        costCenters: [],
      },
    );
    expect(described).toEqual([
      ["Status", "Offen"],
      ["Zuständig", "Einreicher:in"],
      ["Projekt", "BIB-24 · Bildungsinitiative Berlin"],
      ["Kostenstelle", "Alle"],
      ["Von", "01.10.2026"],
      ["Bis", "—"],
    ]);
  });
});
