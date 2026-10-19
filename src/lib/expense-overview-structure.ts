import type { ExpenseStatus, ExpenseType } from "@/lib/mock-data";
import { RESPONSIBLE_PARTY_LABELS, responsiblePartyForStatus } from "@/lib/approval-stage-role";

// Shapes the Belege-Übersicht's rows for display and export. Pure (no
// Supabase, no React), so the page and the Excel export apply exactly the
// same rules:
//
// 1. One row per real spending item. A partner advance that has been split
//    from the partner's Excel is represented by its line items; the advance
//    row stays as their heading ("container") but its amount is never
//    counted again. A not-yet-split advance (submitted_unverified) is still
//    the only record of that money, so it counts.
// 2. "Wartet auf" is always a who: the team or role that acts next, or the
//    submitter's name when the next step is theirs; empty once finished.
// 3. "Seit" is the number of calendar days (Berlin) since the Beleg entered
//    its current status. Open items wait longest-first within a project.

export interface ExpenseOverviewRow {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  costCenterId: string | null;
  costCenterCode: string | null;
  costCenterName: string | null;
  status: ExpenseStatus;
  submittedByName: string | null;
  amount: number;
  description: string;
  vendorName: string | null;
  expenseType: ExpenseType;
  createdAt: string;
  /** When the Beleg entered its current status (latest log row moving it
   * there; created_at if no such row exists). */
  statusSince: string;
  /** Set on a line item split from a partner advance. */
  reconcilesAdvanceId: string | null;
  /** The parent advance's description, for a line item whose advance is not
   * itself in the filtered result. */
  parentAdvanceDescription: string | null;
  invoiceNumber: string | null;
  /** "YYYY-MM-DD"; null for partner advances, Vorschuss line items and
   * expenses from before d4u_backend migration 0036. */
  invoiceDate: string | null;
  paidAt: string | null;
  /** Storage path of the receipt (expenses.document_ref). */
  documentRef: string | null;
  /** Buchhaltungsnotiz (d4u_backend migration 0037). */
  accountingNote: string | null;
  /** What Accounting entered when marking it paid; null before that, and
   * for anyone RLS doesn't let read expense_accounting_details. */
  accounting: ExpenseAccountingSummary | null;
}

export interface ExpenseAccountingSummary {
  bookingKey: string | null;
  vatRate: number | null;
  netAmount: number | null;
  kskLiable: boolean;
  supplierVatId: string | null;
  supplierAddress: string | null;
  supplierBankName: string | null;
}

export interface OverviewItem {
  row: ExpenseOverviewRow;
  /** Line items of a split partner advance, in Excel order. */
  children: ExpenseOverviewRow[];
}

export interface OverviewProjectGroup {
  projectId: string;
  projectCode: string;
  projectName: string;
  items: OverviewItem[];
}

export interface StructuredExpenseOverview {
  groups: OverviewProjectGroup[];
  /** Every row shown, containers and line items included. */
  rowCount: number;
  /** Sum of the rows that count (see countsTowardTotal). */
  total: number;
  /** Whether any split advance is shown, so the page can explain the total. */
  hasSplitAdvances: boolean;
}

const SPLIT_ADVANCE_STATUSES: ReadonlySet<ExpenseStatus> = new Set<ExpenseStatus>([
  "reconciliation_in_progress",
  "reconciliation_submitted",
  "reconciled",
]);

/** A partner advance already split into line items: shown as their heading,
 * its amount represented by them. */
export function isSplitAdvance(row: Pick<ExpenseOverviewRow, "expenseType" | "status">): boolean {
  return row.expenseType === "partner_advance" && SPLIT_ADVANCE_STATUSES.has(row.status);
}

export function countsTowardTotal(
  row: Pick<ExpenseOverviewRow, "expenseType" | "status">,
): boolean {
  return !isSplitAdvance(row);
}

export type OverviewRowKind = "standard" | "partner_advance" | "advance_line";

export function rowKind(
  row: Pick<ExpenseOverviewRow, "expenseType" | "reconcilesAdvanceId">,
): OverviewRowKind {
  if (row.reconcilesAdvanceId) return "advance_line";
  return row.expenseType === "partner_advance" ? "partner_advance" : "standard";
}

export const ROW_KIND_LABELS: Record<OverviewRowKind, string> = {
  standard: "Standardbeleg",
  partner_advance: "Partner-Vorschuss",
  advance_line: "Vorschuss-Position",
};

/** "Wartet auf": the team/role acting next, or the submitter by name; null
 * once nobody has anything left to do (paid, reconciled). */
export function waitingOn(
  row: Pick<ExpenseOverviewRow, "status" | "submittedByName">,
): string | null {
  const party = responsiblePartyForStatus(row.status);
  if (!party) return null;
  if (party === "submitter") return row.submittedByName ?? RESPONSIBLE_PARTY_LABELS.submitter;
  return RESPONSIBLE_PARTY_LABELS[party];
}

const DISPLAY_TIME_ZONE = "Europe/Berlin";
const DAY_MS = 24 * 60 * 60 * 1000;

function berlinDayNumber(instant: Date): number {
  const ymd = instant.toLocaleDateString("en-CA", { timeZone: DISPLAY_TIME_ZONE });
  return Date.parse(`${ymd}T00:00:00Z`) / DAY_MS;
}

/** Calendar days (Berlin) the Beleg has been waiting in its current status;
 * null when nobody is waiting on it. */
export function daysWaiting(
  row: Pick<ExpenseOverviewRow, "status" | "statusSince">,
  now: Date,
): number | null {
  if (!responsiblePartyForStatus(row.status)) return null;
  return Math.max(0, berlinDayNumber(now) - berlinDayNumber(new Date(row.statusSince)));
}

export function formatDaysWaiting(days: number | null): string {
  if (days === null) return "";
  if (days === 0) return "heute";
  return days === 1 ? "1 Tag" : `${days} Tage`;
}

function compareItems(a: OverviewItem, b: OverviewItem): number {
  const aOpen = responsiblePartyForStatus(a.row.status) !== null;
  const bOpen = responsiblePartyForStatus(b.row.status) !== null;
  if (aOpen !== bOpen) return aOpen ? -1 : 1;
  if (aOpen) return a.row.statusSince.localeCompare(b.row.statusSince); // longest waiting first
  return b.row.createdAt.localeCompare(a.row.createdAt); // newest finished first
}

export function structureExpenseOverview(rows: ExpenseOverviewRow[]): StructuredExpenseOverview {
  const shownIds = new Set(rows.map((r) => r.id));
  const childrenByParent = new Map<string, ExpenseOverviewRow[]>();
  for (const row of rows) {
    if (row.reconcilesAdvanceId && shownIds.has(row.reconcilesAdvanceId)) {
      const siblings = childrenByParent.get(row.reconcilesAdvanceId) ?? [];
      siblings.push(row);
      childrenByParent.set(row.reconcilesAdvanceId, siblings);
    }
  }

  const groupsById = new Map<string, OverviewProjectGroup>();
  for (const row of rows) {
    // Nested under its advance when that advance is shown too.
    if (row.reconcilesAdvanceId && shownIds.has(row.reconcilesAdvanceId)) continue;
    const group = groupsById.get(row.projectId) ?? {
      projectId: row.projectId,
      projectCode: row.projectCode,
      projectName: row.projectName,
      items: [],
    };
    const children = (childrenByParent.get(row.id) ?? []).sort(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) || a.description.localeCompare(b.description),
    );
    group.items.push({ row, children });
    groupsById.set(row.projectId, group);
  }

  const groups = [...groupsById.values()].sort((a, b) =>
    a.projectCode.localeCompare(b.projectCode),
  );
  for (const group of groups) group.items.sort(compareItems);

  return {
    groups,
    rowCount: rows.length,
    total: rows.filter(countsTowardTotal).reduce((sum, r) => sum + r.amount, 0),
    hasSplitAdvances: rows.some(isSplitAdvance),
  };
}

/** Display/export order: projects by code, each item followed by its line
 * items. */
export function flattenStructuredOverview(
  overview: StructuredExpenseOverview,
): ExpenseOverviewRow[] {
  return overview.groups.flatMap((g) => g.items.flatMap((item) => [item.row, ...item.children]));
}
