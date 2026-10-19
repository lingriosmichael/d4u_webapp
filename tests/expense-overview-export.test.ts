import { describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import type { ExpenseOverviewRow } from "@/lib/expense-overview-structure";

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
    submittedByName: "Thomas Meier",
    amount: 1500.5,
    description: "Catering Fachtag",
    vendorName: "Bäckerei Schmidt",
    expenseType: "standard",
    createdAt: "2026-10-12T23:30:00Z",
    statusSince: "2026-10-12T23:30:00Z",
    reconcilesAdvanceId: null,
    parentAdvanceDescription: null,
    invoiceNumber: null,
    invoiceDate: null,
    paidAt: null,
    documentRef: null,
    accountingNote: null,
    accounting: null,
    ...overrides,
  };
}

const EXPORTED_AT = new Date("2026-10-13T10:40:00Z");

async function readBack(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  // exceljs's own Buffer typing predates @types/node's generic Buffer; an
  // exact ArrayBuffer copy satisfies both.
  const bytes = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  await workbook.xlsx.load(bytes as ArrayBuffer);
  return workbook;
}

function cellsByHeader(sheet: ExcelJS.Worksheet, rowNumber: number): Record<string, unknown> {
  const headers = sheet.getRow(1).values as unknown[];
  const values = sheet.getRow(rowNumber).values as unknown[];
  return Object.fromEntries(headers.slice(1).map((h, i) => [String(h), values[i + 1] ?? null]));
}

describe("buildExpenseOverviewWorkbook", () => {
  it("writes one header row and one row per Beleg, with real numbers and dates", async () => {
    const buffer = await buildExpenseOverviewWorkbook({
      rows: [row({})],
      filters: [["Status", "Offen"]],
      exportedBy: "Katrina Zuchina",
      exportedAt: EXPORTED_AT,
    });
    const sheet = (await readBack(buffer)).getWorksheet("Belege")!;

    expect((sheet.getRow(1).values as unknown[]).slice(1)).toEqual([
      "Projekt",
      "Projektname",
      "Kostenstelle",
      "Beschreibung",
      "Lieferant / Empfänger",
      "Art",
      "Betrag (EUR)",
      "Zählt zur Summe",
      "Status",
      "Status seit",
      "Tage im Status",
      "Wartet auf",
      "Eingereicht von",
      "Eingereicht am",
      "Rechnungsnummer",
      "Rechnungsdatum",
      "Netto (EUR)",
      "MwSt-Satz (%)",
      "Buchungsschlüssel",
      "KSK-pflichtig",
      "Bezahlt am",
      "USt-IdNr. Lieferant",
      "Adresse Lieferant",
      "Bank Lieferant",
      "Dateiname",
      "Buchhaltungsnotiz",
      "Gehört zu Vorschuss",
      "Beleg-ID",
      "Vorschuss-ID",
    ]);

    const cells = cellsByHeader(sheet, 2);
    expect(cells["Kostenstelle"]).toBe("3200 · Verpflegung");
    expect(cells["Art"]).toBe("Standardbeleg");
    expect(cells["Betrag (EUR)"]).toBe(1500.5);
    expect(sheet.getRow(2).getCell(7).numFmt).toBe('#,##0.00 "€"');
    expect(cells["Zählt zur Summe"]).toBe("Ja");
    expect(cells["Status"]).toBe("Buchhaltungsprüfung");
    expect(cells["Wartet auf"]).toBe("Buchhaltung");
    // 23:30 UTC on 12 Oct is already 13 Oct in Berlin — the day the app shows.
    expect((cells["Eingereicht am"] as Date).toISOString()).toBe("2026-10-13T00:00:00.000Z");
    expect((cells["Status seit"] as Date).toISOString()).toBe("2026-10-13T00:00:00.000Z");
    expect(cells["Tage im Status"]).toBe(0);
    expect(cells["Gehört zu Vorschuss"]).toBeNull();
  });

  it("lists a split Vorschuss before its lines and counts it once", async () => {
    const advance = row({
      id: "adv",
      expenseType: "partner_advance",
      status: "reconciliation_in_progress",
      amount: 3,
      description: "Vorschuss Kulturfonds",
      costCenterCode: null,
      costCenterName: null,
      vendorName: null,
    });
    const lines = ["l1", "l2", "l3"].map((id, i) =>
      row({
        id,
        status: "awaiting_receipt",
        amount: 1,
        description: `Position ${i + 1}`,
        reconcilesAdvanceId: "adv",
        parentAdvanceDescription: "Vorschuss Kulturfonds",
        costCenterCode: null,
        costCenterName: null,
        vendorName: null,
        createdAt: `2026-10-13T10:0${i}:00Z`,
      }),
    );
    const workbook = await readBack(
      await buildExpenseOverviewWorkbook({
        rows: [lines[1], advance, lines[0], lines[2]],
        filters: [],
        exportedBy: "Katrina Zuchina",
        exportedAt: EXPORTED_AT,
      }),
    );
    const sheet = workbook.getWorksheet("Belege")!;

    expect([2, 3, 4, 5].map((n) => cellsByHeader(sheet, n)["Beleg-ID"])).toEqual([
      "adv",
      "l1",
      "l2",
      "l3",
    ]);
    const advanceCells = cellsByHeader(sheet, 2);
    expect(advanceCells["Art"]).toBe("Partner-Vorschuss");
    expect(advanceCells["Zählt zur Summe"]).toBe("Nein");
    expect(advanceCells["Kostenstelle"]).toBeNull();
    const lineCells = cellsByHeader(sheet, 3);
    expect(lineCells["Art"]).toBe("Vorschuss-Position");
    expect(lineCells["Zählt zur Summe"]).toBe("Ja");
    expect(lineCells["Wartet auf"]).toBe("Thomas Meier");
    expect(lineCells["Gehört zu Vorschuss"]).toBe("Vorschuss Kulturfonds");
    expect(lineCells["Vorschuss-ID"]).toBe("adv");

    const info = new Map<string, unknown>();
    workbook
      .getWorksheet("Info")!
      .eachRow((r) => info.set(String(r.getCell(1).value), r.getCell(2).value));
    expect(info.get("Anzahl Einträge")).toBe(4);
    expect(info.get("Summe Betrag (EUR)")).toMatchObject({
      formula: 'SUMIFS(Belege!G2:G5,Belege!H2:H5,"Ja")',
      result: 3,
    });
  });

  it("exports the invoice, payment and accounting fields of a paid Beleg", async () => {
    const sheet = (
      await readBack(
        await buildExpenseOverviewWorkbook({
          rows: [
            row({
              status: "paid",
              invoiceNumber: "RE2026/07-2632",
              invoiceDate: "2026-10-01",
              // 22:30 UTC on 12 Oct is 13 Oct in Berlin.
              paidAt: "2026-10-12T22:30:00Z",
              documentRef: "BIB-24/5d1c2b6e-0000-4000-8000-000000000000/Rechnung_42.pdf",
              accountingNote: "Schlussrechnung RE-2026-114, Zahlung am 12.10. (Ref. 88341).",
              accounting: {
                bookingKey: "4930",
                vatRate: 19,
                netAmount: 1260.92,
                kskLiable: false,
                supplierVatId: "DE123456789",
                supplierAddress: "Musterstraße 1, 10115 Berlin",
                supplierBankName: "Berliner Sparkasse",
              },
            }),
          ],
          filters: [],
          exportedBy: "Katrina Zuchina",
          exportedAt: EXPORTED_AT,
        }),
      )
    ).getWorksheet("Belege")!;
    const cells = cellsByHeader(sheet, 2);

    expect(cells["Rechnungsnummer"]).toBe("RE2026/07-2632");
    expect((cells["Rechnungsdatum"] as Date).toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(cells["Netto (EUR)"]).toBe(1260.92);
    expect(cells["MwSt-Satz (%)"]).toBe(19);
    expect(cells["Buchungsschlüssel"]).toBe("4930");
    expect(cells["KSK-pflichtig"]).toBe("Nein");
    expect((cells["Bezahlt am"] as Date).toISOString()).toBe("2026-10-13T00:00:00.000Z");
    expect(cells["USt-IdNr. Lieferant"]).toBe("DE123456789");
    expect(cells["Adresse Lieferant"]).toBe("Musterstraße 1, 10115 Berlin");
    expect(cells["Bank Lieferant"]).toBe("Berliner Sparkasse");
    expect(cells["Dateiname"]).toBe("Rechnung_42.pdf");
    expect(cells["Buchhaltungsnotiz"]).toBe(
      "Schlussrechnung RE-2026-114, Zahlung am 12.10. (Ref. 88341).",
    );

    const headers = (sheet.getRow(1).values as unknown[]).slice(1);
    const column = (header: string) => headers.indexOf(header) + 1;
    expect(sheet.getRow(2).getCell(column("Netto (EUR)")).numFmt).toBe('#,##0.00 "€"');
    expect(sheet.getRow(2).getCell(column("Rechnungsdatum")).numFmt).toBe("dd.mm.yyyy");
    expect(sheet.getRow(2).getCell(column("Bezahlt am")).numFmt).toBe("dd.mm.yyyy");
  });

  it("leaves the accounting fields empty before a Beleg is paid", async () => {
    const sheet = (
      await readBack(
        await buildExpenseOverviewWorkbook({
          rows: [row({ invoiceDate: "2026-10-01" })],
          filters: [],
          exportedBy: "Katrina Zuchina",
          exportedAt: EXPORTED_AT,
        }),
      )
    ).getWorksheet("Belege")!;
    const cells = cellsByHeader(sheet, 2);

    expect((cells["Rechnungsdatum"] as Date).toISOString()).toBe("2026-10-01T00:00:00.000Z");
    for (const header of [
      "Rechnungsnummer",
      "Netto (EUR)",
      "MwSt-Satz (%)",
      "Buchungsschlüssel",
      "KSK-pflichtig",
      "Bezahlt am",
      "USt-IdNr. Lieferant",
      "Adresse Lieferant",
      "Bank Lieferant",
      "Dateiname",
    ]) {
      expect(cells[header], header).toBeNull();
    }
  });

  it("leaves Wartet auf and the waiting time empty once a Beleg is finished", async () => {
    const sheet = (
      await readBack(
        await buildExpenseOverviewWorkbook({
          rows: [row({ status: "paid" })],
          filters: [],
          exportedBy: "Katrina Zuchina",
          exportedAt: EXPORTED_AT,
        }),
      )
    ).getWorksheet("Belege")!;
    const cells = cellsByHeader(sheet, 2);
    expect(cells["Wartet auf"]).toBeNull();
    expect(cells["Tage im Status"]).toBeNull();
    expect(cells["Status seit"]).toBeNull();
  });

  it("puts who, when, how many, the total and the filters on the Info sheet", async () => {
    const workbook = await readBack(
      await buildExpenseOverviewWorkbook({
        rows: [row({ amount: 10 }), row({ id: "b", amount: 2.5 })],
        filters: [
          ["Status", "Alle"],
          ["Projekt", "BIB-24 · Bildungsinitiative Berlin"],
        ],
        exportedBy: "Katrina Zuchina",
        exportedAt: EXPORTED_AT,
      }),
    );
    const info = new Map<string, unknown>();
    workbook
      .getWorksheet("Info")!
      .eachRow((r) => info.set(String(r.getCell(1).value), r.getCell(2).value));

    expect(info.get("Exportiert am")).toBe("13.10.2026, 12:40");
    expect(info.get("Exportiert von")).toBe("Katrina Zuchina");
    expect(info.get("Anzahl Einträge")).toBe(2);
    expect(info.get("Summe Betrag (EUR)")).toMatchObject({ result: 12.5 });
    expect(info.get("Projekt")).toBe("BIB-24 · Bildungsinitiative Berlin");
  });

  it("still produces a valid file with no rows", async () => {
    const workbook = await readBack(
      await buildExpenseOverviewWorkbook({
        rows: [],
        filters: [],
        exportedBy: "Katrina Zuchina",
        exportedAt: EXPORTED_AT,
      }),
    );
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
      ["Wartet auf", "Einreicher:in"],
      ["Projekt", "BIB-24 · Bildungsinitiative Berlin"],
      ["Kostenstelle", "Alle"],
      ["Von", "01.10.2026"],
      ["Bis", "—"],
    ]);
  });
});
