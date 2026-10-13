import "server-only";
import ExcelJS from "exceljs";
import { statusLabel } from "@/lib/mock-data";
import { RESPONSIBLE_PARTY_LABELS, responsibleLabelForStatus } from "@/lib/approval-stage-role";
import type {
  ExpenseOverviewFilterOptions,
  ExpenseOverviewFilters,
  ExpenseOverviewRow,
} from "@/lib/supabase/queries/visualization";

// The Belege-Übersicht as an .xlsx file: exactly the rows the filtered list
// shows, for Accounting/CEO to work with in Excel (funder reports, checks).
// Sheet "Belege" is a plain table starting at A1 — one header row, one row
// per Beleg, real numbers and dates — so it can be sorted, filtered and
// pivoted without cleaning it up first. Who exported it, when, and with
// which filters goes on a second sheet, "Info", rather than above the table.

const DISPLAY_TIME_ZONE = "Europe/Berlin";
const EURO_FORMAT = '#,##0.00 "€"';
const DATE_FORMAT = "dd.mm.yyyy";

const EXPENSE_TYPE_LABELS: Record<ExpenseOverviewRow["expenseType"], string> = {
  standard: "Standardbeleg",
  partner_advance: "Partner-Vorschuss",
};

const COLUMNS: Array<{ header: string; key: string; width: number }> = [
  { header: "Projekt", key: "projectCode", width: 10 },
  { header: "Projektname", key: "projectName", width: 28 },
  { header: "Kostenstelle", key: "costCenter", width: 24 },
  { header: "Beschreibung", key: "description", width: 42 },
  { header: "Lieferant / Empfänger", key: "vendor", width: 26 },
  { header: "Art", key: "expenseType", width: 18 },
  { header: "Betrag (EUR)", key: "amount", width: 15 },
  { header: "Status", key: "status", width: 22 },
  { header: "Zuständig", key: "responsible", width: 18 },
  { header: "Eingereicht von", key: "submittedBy", width: 24 },
  { header: "Eingereicht am", key: "createdAt", width: 15 },
  { header: "Beleg-ID", key: "id", width: 38 },
];

/** The calendar day in Berlin, as a UTC-midnight Date: Excel dates carry no
 * time zone, so this makes Excel show the same day the app shows. */
export function berlinCalendarDate(iso: string): Date {
  const ymd = new Date(iso).toLocaleDateString("en-CA", { timeZone: DISPLAY_TIME_ZONE });
  return new Date(`${ymd}T00:00:00Z`);
}

function formatBerlinDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: DISPLAY_TIME_ZONE,
  });
}

/** The active filters in words, for the Info sheet — same wording as the
 * filter bar. */
export function describeExpenseOverviewFilters(
  filters: ExpenseOverviewFilters,
  options: ExpenseOverviewFilterOptions,
): Array<[string, string]> {
  const project = options.projects.find((p) => p.id === filters.projectId);
  const costCenter = options.costCenters.find((c) => c.id === filters.costCenterId);
  const status =
    filters.status === "all" ? "Alle" : filters.status ? statusLabel(filters.status) : "Offen";
  return [
    ["Status", status],
    [
      "Zuständig",
      filters.responsibleParty ? RESPONSIBLE_PARTY_LABELS[filters.responsibleParty] : "Alle",
    ],
    ["Projekt", project ? `${project.code} · ${project.name}` : "Alle"],
    ["Kostenstelle", costCenter ? `${costCenter.code} · ${costCenter.name}` : "Alle"],
    ["Von", filters.from ? formatBerlinDate(`${filters.from}T12:00:00Z`) : "—"],
    ["Bis", filters.to ? formatBerlinDate(`${filters.to}T12:00:00Z`) : "—"],
  ];
}

/** "D4U_Belege_2026-10-13.xlsx", dated in Berlin time. */
export function expenseOverviewFileName(exportedAt: Date): string {
  const ymd = exportedAt.toLocaleDateString("en-CA", { timeZone: DISPLAY_TIME_ZONE });
  return `D4U_Belege_${ymd}.xlsx`;
}

export async function buildExpenseOverviewWorkbook(input: {
  rows: ExpenseOverviewRow[];
  filters: Array<[string, string]>;
  exportedBy: string;
  exportedAt: Date;
}): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "D4U Finance";
  workbook.created = input.exportedAt;

  const sheet = workbook.addWorksheet("Belege", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = COLUMNS;
  for (const row of input.rows) {
    sheet.addRow({
      projectCode: row.projectCode,
      projectName: row.projectName,
      // Missing values stay truly empty (null), not "" — Excel counts an
      // empty string as a filled cell.
      costCenter: row.costCenterCode ? `${row.costCenterCode} · ${row.costCenterName}` : null,
      description: row.description,
      vendor: row.vendorName,
      expenseType: EXPENSE_TYPE_LABELS[row.expenseType],
      amount: row.amount,
      status: statusLabel(row.status),
      responsible: responsibleLabelForStatus(row.status),
      submittedBy: row.submittedByName,
      createdAt: berlinCalendarDate(row.createdAt),
      id: row.id,
    });
  }
  sheet.getColumn("amount").numFmt = EURO_FORMAT;
  sheet.getColumn("createdAt").numFmt = DATE_FORMAT;
  sheet.getRow(1).font = { bold: true };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };

  const info = workbook.addWorksheet("Info");
  info.columns = [
    { key: "label", width: 22 },
    { key: "value", width: 48 },
  ];
  const lastDataRow = input.rows.length + 1;
  const amountColumn = sheet.getColumn("amount").letter;
  const exported = input.exportedAt.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: DISPLAY_TIME_ZONE,
  });
  info.addRow({ label: "D4U Finance — Belege-Übersicht" }).font = { bold: true, size: 13 };
  info.addRow({});
  info.addRow({ label: "Exportiert am", value: exported });
  info.addRow({ label: "Exportiert von", value: input.exportedBy });
  info.addRow({ label: "Anzahl Belege", value: input.rows.length });
  const total = info.addRow({
    label: "Summe Betrag (EUR)",
    value:
      input.rows.length > 0
        ? {
            formula: `SUM(Belege!${amountColumn}2:${amountColumn}${lastDataRow})`,
            result: input.rows.reduce((sum, r) => sum + r.amount, 0),
          }
        : 0,
  });
  total.getCell("value").numFmt = EURO_FORMAT;
  info.addRow({});
  info.addRow({ label: "Filter" }).font = { bold: true };
  for (const [label, value] of input.filters) info.addRow({ label, value });
  info.getColumn("value").alignment = { horizontal: "left" };

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
