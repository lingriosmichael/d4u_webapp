import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  OPEN_EXPENSE_STATUSES,
  ALL_EXPENSE_STATUSES,
  type ExpenseStatus,
  type ExpenseType,
} from "@/lib/mock-data";
import {
  responsiblePartyForStatus,
  statusesForResponsibleParty,
  type ResponsibleParty,
} from "@/lib/approval-stage-role";

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
  const openAdvancesCount = rows.filter((e) => e.status === "submitted_unverified").length;

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
// writes that column, so it's stale on every real row. "Zuständigkeit" is
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

export interface ExpenseOverviewRow {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  costCenterId: string | null;
  costCenterCode: string | null;
  costCenterName: string | null;
  status: ExpenseStatus;
  responsibleParty: ResponsibleParty | null;
  submittedByName: string | null;
  amount: number;
  description: string;
  vendorName: string | null;
  expenseType: ExpenseType;
  createdAt: string;
}

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
  let query = supabase
    .from("expenses")
    .select(
      "id, project_id, cost_center_id, status, submitted_by, amount, description, vendor_name, expense_type, created_at",
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

  const projectIds = [...new Set(rows.map((r) => r.project_id))];
  const costCenterIds = [
    ...new Set(rows.map((r) => r.cost_center_id).filter((id): id is string => !!id)),
  ];
  const submitterIds = [
    ...new Set(rows.map((r) => r.submitted_by).filter((id): id is string => !!id)),
  ];

  const [{ data: projects }, { data: costCenters }, { data: users }] = await Promise.all([
    projectIds.length
      ? supabase.from("projects").select("id, code, name").in("id", projectIds)
      : Promise.resolve({ data: [] as { id: string; code: string; name: string }[] }),
    costCenterIds.length
      ? supabase.from("cost_centers").select("id, code, name").in("id", costCenterIds)
      : Promise.resolve({ data: [] as { id: string; code: string; name: string }[] }),
    submitterIds.length
      ? supabase.from("users").select("id, first_name, last_name").in("id", submitterIds)
      : Promise.resolve({ data: [] as { id: string; first_name: string; last_name: string }[] }),
  ]);

  const projectById = new Map((projects ?? []).map((p) => [p.id, p]));
  const costCenterById = new Map((costCenters ?? []).map((c) => [c.id, c]));
  const userNameById = new Map(
    (users ?? []).map((u) => [u.id, `${u.first_name} ${u.last_name}`.trim()]),
  );

  return rows.map((row) => {
    const project = projectById.get(row.project_id);
    const costCenter = row.cost_center_id ? costCenterById.get(row.cost_center_id) : undefined;
    const status = row.status as ExpenseStatus;

    return {
      id: row.id,
      projectId: row.project_id,
      projectCode: project?.code ?? "—",
      projectName: project?.name ?? "—",
      costCenterId: row.cost_center_id,
      costCenterCode: costCenter?.code ?? null,
      costCenterName: costCenter?.name ?? null,
      status,
      responsibleParty: responsiblePartyForStatus(status),
      submittedByName: row.submitted_by ? (userNameById.get(row.submitted_by) ?? null) : null,
      amount: Number(row.amount),
      description: row.description,
      vendorName: row.vendor_name,
      expenseType: row.expense_type as ExpenseType,
      createdAt: row.created_at,
    };
  });
}
