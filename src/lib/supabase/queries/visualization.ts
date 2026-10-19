import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  OPEN_ADVANCE_STATUSES,
  OPEN_EXPENSE_STATUSES,
  ALL_EXPENSE_STATUSES,
  type ExpenseStatus,
  type ExpenseType,
  type ReceiptStatus,
} from "@/lib/mock-data";
import { statusesForResponsibleParty, type ResponsibleParty } from "@/lib/approval-stage-role";
import type {
  ExpenseAccountingSummary,
  ExpenseOverviewRow,
} from "@/lib/expense-overview-structure";

// Data-access layer for Auswertung. Read-only — no write actions on this
// screen, so no d4u_backend calls here, only direct Supabase reads (the
// sanctioned read-path per the frontend's own non-negotiable rule).
// Soll/Ist/Obligo come straight from budget_lines' backend-computed
// columns, never re-derived from expense rows — same rule Übersicht's
// dashboard.ts already follows.

export interface VisualizationProject {
  id: string;
  code: string;
  name: string;
  leadUserId: string | null;
}

export interface BudgetStatus {
  soll: number;
  ist: number;
  obligo: number;
}

export interface VisualizationGroup {
  id: string;
  projectId: string;
  name: string;
  warningThresholdPct: number;
  status: BudgetStatus;
  costCenters: Array<{ id: string; code: string; name: string }>;
}

export interface VisualizationOverview {
  projects: VisualizationProject[];
  statusByProject: Record<string, BudgetStatus>;
  pendingCount: number;
  openAdvancesCount: number;
}

// "finance_approval" removed 2026-09-05 (documentation/approval_routing.md)
// — Finance Manager has no approval role under the new model.
const PENDING_STATUSES = ["ceo_approval", "accounting_approval", "submitted"];

export async function getVisualizationOverview(): Promise<VisualizationOverview> {
  const supabase = await createClient();

  const [{ data: projects }, { data: budgetLines }, { data: expenses }] = await Promise.all([
    supabase.from("projects").select("id, code, name, lead_user_id").order("code"),
    supabase
      .from("budget_lines")
      .select("project_id, allocated_amount, consumed_amount, obligo_amount"),
    supabase.from("expenses").select("status"),
  ]);

  const statusByProject: Record<string, BudgetStatus> = {};
  for (const b of budgetLines ?? []) {
    const existing = statusByProject[b.project_id] ?? { soll: 0, ist: 0, obligo: 0 };
    existing.soll += Number(b.allocated_amount);
    existing.ist += Number(b.consumed_amount);
    existing.obligo += Number(b.obligo_amount);
    statusByProject[b.project_id] = existing;
  }

  const rows = expenses ?? [];
  const pendingCount = rows.filter((e) => PENDING_STATUSES.includes(e.status)).length;
  const openAdvancesCount = rows.filter((e) => OPEN_ADVANCE_STATUSES.includes(e.status)).length;

  return {
    projects: (projects ?? []).map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      leadUserId: p.lead_user_id,
    })),
    statusByProject,
    pendingCount,
    openAdvancesCount,
  };
}

export interface AdvanceOverviewRow {
  id: string;
  partnerName: string;
  amount: number;
  reconciledAmount: number | null;
  status: "submitted_unverified" | "reconciled";
  reconciledAt: string | null;
}

// Vorschuss-Übersicht (Auswertung, Accounting/CEO only — gated by the
// caller, not by RLS: partners/expenses reads are org-wide under RLS).
// "Freigegeben" is derived, never stored: amount - reconciled_amount, the
// latter already computed and written by advance_reconcile onto the
// placeholder row, so no re-summing of child expenses is needed here.
export async function getAdvanceOverview(): Promise<AdvanceOverviewRow[]> {
  const supabase = await createClient();
  const { data: advances } = await supabase
    .from("expenses")
    .select("id, partner_id, amount, reconciled_amount, status, updated_at")
    .eq("expense_type", "partner_advance")
    .order("updated_at", { ascending: false });

  const rows = advances ?? [];
  const partnerIds = [...new Set(rows.map((r) => r.partner_id).filter((id): id is string => !!id))];
  const { data: partners } = partnerIds.length
    ? await supabase.from("partners").select("id, name").in("id", partnerIds)
    : { data: [] as { id: string; name: string }[] };
  const partnerNameById = new Map((partners ?? []).map((p) => [p.id, p.name]));

  return rows.map((row) => ({
    id: row.id,
    partnerName: (row.partner_id && partnerNameById.get(row.partner_id)) ?? "—",
    amount: Number(row.amount),
    reconciledAmount: row.reconciled_amount === null ? null : Number(row.reconciled_amount),
    status: row.status as "submitted_unverified" | "reconciled",
    reconciledAt: row.status === "reconciled" ? row.updated_at : null,
  }));
}

export async function getProjectDrilldown(projectId: string): Promise<{
  project: VisualizationProject | null;
  total: BudgetStatus;
  groups: VisualizationGroup[];
}> {
  const supabase = await createClient();

  const [{ data: project }, { data: groups }, { data: budgetLines }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, code, name, lead_user_id")
      .eq("id", projectId)
      .maybeSingle(),
    supabase.from("cost_center_groups").select("id, project_id, name").eq("project_id", projectId),
    supabase
      .from("budget_lines")
      .select("group_id, allocated_amount, consumed_amount, obligo_amount, warning_threshold_pct")
      .eq("project_id", projectId),
  ]);

  const groupRows = groups ?? [];
  const budgetByGroup = new Map((budgetLines ?? []).map((b) => [b.group_id, b]));

  const groupIds = groupRows.map((g) => g.id);
  const { data: members } = groupIds.length
    ? await supabase
        .from("cost_center_group_members")
        .select("group_id, cost_center_id")
        .in("group_id", groupIds)
    : { data: [] as { group_id: string; cost_center_id: string }[] };
  const costCenterIdsByGroup = new Map<string, string[]>();
  for (const m of members ?? []) {
    const list = costCenterIdsByGroup.get(m.group_id) ?? [];
    list.push(m.cost_center_id);
    costCenterIdsByGroup.set(m.group_id, list);
  }
  const allCostCenterIds = [...new Set((members ?? []).map((m) => m.cost_center_id))];
  const { data: costCenters } = allCostCenterIds.length
    ? await supabase.from("cost_centers").select("id, code, name").in("id", allCostCenterIds)
    : { data: [] as { id: string; code: string; name: string }[] };
  const costCenterById = new Map((costCenters ?? []).map((c) => [c.id, c]));

  const total: BudgetStatus = { soll: 0, ist: 0, obligo: 0 };
  const groupsResult: VisualizationGroup[] = groupRows.map((g) => {
    const b = budgetByGroup.get(g.id);
    const status: BudgetStatus = {
      soll: b ? Number(b.allocated_amount) : 0,
      ist: b ? Number(b.consumed_amount) : 0,
      obligo: b ? Number(b.obligo_amount) : 0,
    };
    total.soll += status.soll;
    total.ist += status.ist;
    total.obligo += status.obligo;

    return {
      id: g.id,
      projectId: g.project_id,
      name: g.name,
      warningThresholdPct: b ? Number(b.warning_threshold_pct) : 80,
      status,
      costCenters: (costCenterIdsByGroup.get(g.id) ?? [])
        .map((id) => costCenterById.get(id))
        .filter((c): c is { id: string; code: string; name: string } => !!c),
    };
  });

  return {
    project: project
      ? { id: project.id, code: project.code, name: project.name, leadUserId: project.lead_user_id }
      : null,
    total,
    groups: groupsResult,
  };
}

// ---- Belege-Übersicht (Accounting/CEO only, gated by the caller) ---------
//
// Per-expense table grouped by project so Accounting/CEO can see, at a
// glance, every open expense and whose court the ball is currently in —
// without querying the database directly. Read-only, same as the rest of
// this file.
//
// Deliberately does NOT read/filter on expenses.assigned_approver: verified
// against the live backend (see approval-stage-role.ts) that no route ever
// writes that column, so it's stale on every real row. "Wartet auf" is
// derived from status via responsiblePartyForStatus instead — the same
// source of truth the dashboard's needs-action logic uses.

export interface ExpenseOverviewFilters {
  /** A specific status, or "all" to include closed (paid/reconciled) rows too. Omitted = open-only default. */
  status?: ExpenseStatus | "all";
  responsibleParty?: ResponsibleParty;
  costCenterId?: string;
  projectId?: string;
  /** Inclusive, yyyy-mm-dd */
  from?: string;
  /** Inclusive, yyyy-mm-dd */
  to?: string;
}

const RESPONSIBLE_PARTIES: ResponsibleParty[] = ["ceo", "accounting", "submitter"];

/**
 * Validates raw (URL search param) strings into typed filters. Kept next to
 * the filter shape it feeds — the page/view layer shouldn't need its own
 * copy of the status/responsible-party enums to check against.
 */
export function parseExpenseOverviewFilters(raw: {
  status?: string;
  responsible?: string;
  costCenter?: string;
  // Named distinctly from the page-level `project` search param (which
  // opens the project drilldown view entirely — see visualization-view.tsx)
  // to avoid the two colliding.
  expenseProject?: string;
  from?: string;
  to?: string;
}): ExpenseOverviewFilters {
  const status =
    raw.status === "all" || ALL_EXPENSE_STATUSES.includes(raw.status as ExpenseStatus)
      ? (raw.status as ExpenseStatus | "all")
      : undefined;
  const responsibleParty = RESPONSIBLE_PARTIES.includes(raw.responsible as ResponsibleParty)
    ? (raw.responsible as ResponsibleParty)
    : undefined;

  return {
    status,
    responsibleParty,
    costCenterId: raw.costCenter || undefined,
    projectId: raw.expenseProject || undefined,
    from: raw.from || undefined,
    to: raw.to || undefined,
  };
}

function resolveStatusFilter(filters: ExpenseOverviewFilters): ExpenseStatus[] {
  let statuses: ExpenseStatus[] =
    filters.status === "all"
      ? ALL_EXPENSE_STATUSES
      : filters.status
        ? [filters.status]
        : OPEN_EXPENSE_STATUSES;

  if (filters.responsibleParty) {
    const allowed = statusesForResponsibleParty(filters.responsibleParty);
    statuses = statuses.filter((s) => allowed.includes(s));
  }
  return statuses;
}

// Row shape lives with the grouping/counting rules that use it
// (src/lib/expense-overview-structure.ts), re-exported here for callers.
export type { ExpenseOverviewRow } from "@/lib/expense-overview-structure";

export interface ExpenseOverviewFilterOptions {
  costCenters: Array<{ id: string; code: string; name: string }>;
  projects: Array<{ id: string; code: string; name: string }>;
}

export async function getExpenseOverviewFilterOptions(): Promise<ExpenseOverviewFilterOptions> {
  const supabase = await createClient();
  const [{ data: costCenters }, { data: projects }] = await Promise.all([
    supabase.from("cost_centers").select("id, code, name").order("code"),
    supabase.from("projects").select("id, code, name").order("code"),
  ]);
  return { costCenters: costCenters ?? [], projects: projects ?? [] };
}

export async function getExpenseOverview(
  filters: ExpenseOverviewFilters = {},
): Promise<ExpenseOverviewRow[]> {
  const statuses = resolveStatusFilter(filters);
  if (statuses.length === 0) return [];

  const supabase = await createClient();
  // approval_logs and expense_accounting_details are embedded (not second
  // .in() queries by id) so a long result list can't overflow the request
  // URL. approval_logs supplies when each Beleg entered its current status;
  // the invoice, payment and accounting fields are for the Excel export.
  let query = supabase
    .from("expenses")
    .select(
      "id, project_id, cost_center_id, status, submitted_by, amount, description, vendor_name, invoice_number, invoice_date, paid_at, document_ref, receipt_status, accounting_note, expense_type, created_at, reconciles_advance_id, approval_logs(to_status, created_at), expense_accounting_details(booking_key, vat_rate, net_amount, ksk_liable, supplier_vat_id, supplier_address, supplier_bank_name)",
    )
    .in("status", statuses)
    .order("created_at", { ascending: false });

  if (filters.costCenterId) query = query.eq("cost_center_id", filters.costCenterId);
  if (filters.projectId) query = query.eq("project_id", filters.projectId);
  if (filters.from) query = query.gte("created_at", filters.from);
  if (filters.to) query = query.lte("created_at", `${filters.to}T23:59:59.999`);

  const { data, error } = await query;
  if (error) throw error;
  const rows = data ?? [];

  const shownIds = new Set(rows.map((r) => r.id));
  const projectIds = [...new Set(rows.map((r) => r.project_id))];
  const costCenterIds = [
    ...new Set(rows.map((r) => r.cost_center_id).filter((id): id is string => !!id)),
  ];
  const submitterIds = [
    ...new Set(rows.map((r) => r.submitted_by).filter((id): id is string => !!id)),
  ];
  // Line items whose advance isn't in this result (filtered out by status,
  // say) still name the advance they belong to.
  const missingParentIds = [
    ...new Set(
      rows
        .map((r) => r.reconciles_advance_id as string | null)
        .filter((id): id is string => !!id && !shownIds.has(id)),
    ),
  ];

  const [{ data: projects }, { data: costCenters }, { data: users }, { data: parents }] =
    await Promise.all([
      projectIds.length
        ? supabase.from("projects").select("id, code, name").in("id", projectIds)
        : Promise.resolve({ data: [] as { id: string; code: string; name: string }[] }),
      costCenterIds.length
        ? supabase.from("cost_centers").select("id, code, name").in("id", costCenterIds)
        : Promise.resolve({ data: [] as { id: string; code: string; name: string }[] }),
      submitterIds.length
        ? supabase.from("users").select("id, first_name, last_name").in("id", submitterIds)
        : Promise.resolve({ data: [] as { id: string; first_name: string; last_name: string }[] }),
      missingParentIds.length
        ? supabase.from("expenses").select("id, description").in("id", missingParentIds)
        : Promise.resolve({ data: [] as { id: string; description: string }[] }),
    ]);

  const projectById = new Map((projects ?? []).map((p) => [p.id, p]));
  const costCenterById = new Map((costCenters ?? []).map((c) => [c.id, c]));
  const userNameById = new Map(
    (users ?? []).map((u) => [u.id, `${u.first_name} ${u.last_name}`.trim()]),
  );
  const parentDescriptionById = new Map((parents ?? []).map((p) => [p.id, p.description]));
  const descriptionById = new Map(rows.map((r) => [r.id, r.description as string]));

  return rows.map((row) => {
    const project = projectById.get(row.project_id);
    const costCenter = row.cost_center_id ? costCenterById.get(row.cost_center_id) : undefined;
    const status = row.status as ExpenseStatus;
    const parentId = (row.reconciles_advance_id as string | null) ?? null;

    return {
      id: row.id,
      projectId: row.project_id,
      projectCode: project?.code ?? "—",
      projectName: project?.name ?? "—",
      costCenterId: row.cost_center_id,
      costCenterCode: costCenter?.code ?? null,
      costCenterName: costCenter?.name ?? null,
      status,
      submittedByName: row.submitted_by ? (userNameById.get(row.submitted_by) ?? null) : null,
      amount: Number(row.amount),
      description: row.description,
      vendorName: row.vendor_name,
      expenseType: row.expense_type as ExpenseType,
      createdAt: row.created_at,
      statusSince: statusSinceOf(status, row.created_at, row.approval_logs ?? []),
      reconcilesAdvanceId: parentId,
      parentAdvanceDescription: parentId
        ? (descriptionById.get(parentId) ?? parentDescriptionById.get(parentId) ?? null)
        : null,
      invoiceNumber: row.invoice_number ?? null,
      invoiceDate: row.invoice_date ?? null,
      paidAt: row.paid_at ?? null,
      documentRef: row.document_ref ?? null,
      receiptStatus: row.receipt_status as ReceiptStatus,
      accountingNote: row.accounting_note ?? null,
      accounting: accountingSummaryOf(row.expense_accounting_details),
    };
  });
}

interface AccountingDetailsRow {
  booking_key: string | null;
  vat_rate: number | string | null;
  net_amount: number | string | null;
  ksk_liable: boolean;
  supplier_vat_id: string | null;
  supplier_address: string | null;
  supplier_bank_name: string | null;
}

/** expense_accounting_details is keyed by expense_id, so PostgREST embeds
 * it as one object or null; an array is accepted too, in case the
 * relationship is ever read as one-to-many. Numerics arrive as strings. */
function accountingSummaryOf(
  embedded: AccountingDetailsRow | AccountingDetailsRow[] | null | undefined,
): ExpenseAccountingSummary | null {
  const details = Array.isArray(embedded) ? embedded[0] : embedded;
  if (!details) return null;
  return {
    bookingKey: details.booking_key,
    vatRate: details.vat_rate != null ? Number(details.vat_rate) : null,
    netAmount: details.net_amount != null ? Number(details.net_amount) : null,
    kskLiable: details.ksk_liable,
    supplierVatId: details.supplier_vat_id,
    supplierAddress: details.supplier_address,
    supplierBankName: details.supplier_bank_name,
  };
}

/** When the Beleg entered its current status: the latest log row that moved
 * it there, else the latest status change of any kind, else its creation
 * (split line items are created directly in awaiting_receipt). */
function statusSinceOf(
  status: ExpenseStatus,
  createdAt: string,
  logs: Array<{ to_status: string | null; created_at: string }>,
): string {
  const latest = (entries: typeof logs) =>
    entries.reduce<string | null>(
      (max, l) => (max === null || l.created_at > max ? l.created_at : max),
      null,
    );
  return (
    latest(logs.filter((l) => l.to_status === status)) ??
    latest(logs.filter((l) => l.to_status !== null)) ??
    createdAt
  );
}
