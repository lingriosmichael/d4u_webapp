import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ExpenseStatus, ExpenseType, ReceiptStatus } from "@/lib/mock-data";

// Data-access layer for the Expense Detail screen — the last screen still
// reading lib/mock-data.ts before this file. Column names cross-referenced
// against d4u_backend's src/types/domain.ts and
// d4u_webapp/documentation/0001_rls_policies.sql (same caveat as
// everywhere else in this codebase: not checked against generated types).
//
// Note: Postgres `numeric` columns come back from supabase-js as strings,
// not numbers (precision safety) — every amount field here is explicitly
// Number()-converted rather than trusted to already be numeric.

export interface ExpenseLogEntry {
  id: string;
  actorId: string;
  actorName: string | null;
  action: string;
  note: string | null;
  at: string;
}

export interface ReconciledLine {
  id: string;
  costCenterCode: string | null;
  costCenterName: string | null;
  description: string;
  netAmount: number;
  vatRate: number;
  grossAmount: number;
}

export interface ExpenseDetail {
  id: string;
  status: ExpenseStatus;
  expenseType: ExpenseType;
  amount: number;
  reconciledAmount: number | null;
  description: string;
  vendor: string | null;
  invoiceNumber: string | null;
  receiptStatus: ReceiptStatus;
  documentRef: string | null;
  createdAt: string;
  projectId: string;
  projectCode: string | null;
  projectName: string | null;
  groupId: string;
  groupName: string | null;
  costCenterId: string | null;
  costCenterCode: string | null;
  costCenterName: string | null;
  submittedBy: string;
  submitterName: string | null;
  assignedApprover: string | null;
  partnerId: string | null;
  partnerName: string | null;
  logs: ExpenseLogEntry[];
  /** Cost centers belonging to this expense's group — for the EditForm and
   * ReconcileForm dropdowns, scoped the same way the create-expense route
   * validates (cost_center_group_members). */
  groupCostCenters: Array<{ id: string; code: string; name: string }>;
  reconciledLines: ReconciledLine[];
}

export async function getExpenseDetail(id: string): Promise<ExpenseDetail | null> {
  const supabase = await createClient();

  const { data: expense, error } = await supabase
    .from("expenses")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !expense) return null;

  // expenses.budget_line_id points at a budget_line, not a group directly —
  // resolve group_id through it before anything that needs the group.
  const { data: budgetLine } = await supabase
    .from("budget_lines")
    .select("group_id")
    .eq("id", expense.budget_line_id)
    .maybeSingle();

  const [
    project,
    resolvedGroup,
    costCenter,
    submitter,
    partner,
    groupCostCenters,
    logs,
    reconciledChildren,
  ] = await Promise.all([
    supabase.from("projects").select("id, code, name").eq("id", expense.project_id).maybeSingle(),
    budgetLine
      ? supabase
          .from("cost_center_groups")
          .select("id, name")
          .eq("id", budgetLine.group_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    expense.cost_center_id
      ? supabase
          .from("cost_centers")
          .select("id, code, name")
          .eq("id", expense.cost_center_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("users")
      .select("first_name, last_name")
      .eq("id", expense.submitted_by)
      .maybeSingle(),
    expense.partner_id
      ? supabase.from("partners").select("id, name").eq("id", expense.partner_id).maybeSingle()
      : Promise.resolve({ data: null }),
    getGroupCostCenters(expense.budget_line_id),
    getLogs(id),
    expense.status === "reconciled" ? getReconciledLines(id) : Promise.resolve([]),
  ]);

  return {
    id: expense.id,
    status: expense.status,
    expenseType: expense.expense_type,
    amount: Number(expense.amount),
    reconciledAmount: expense.reconciled_amount != null ? Number(expense.reconciled_amount) : null,
    description: expense.description,
    vendor: expense.vendor_name,
    invoiceNumber: expense.invoice_number,
    receiptStatus: expense.receipt_status,
    documentRef: expense.document_ref,
    createdAt: expense.created_at,
    projectId: expense.project_id,
    projectCode: project.data?.code ?? null,
    projectName: project.data?.name ?? null,
    groupId: budgetLine?.group_id ?? "",
    groupName: resolvedGroup.data?.name ?? null,
    costCenterId: expense.cost_center_id,
    costCenterCode: costCenter.data?.code ?? null,
    costCenterName: costCenter.data?.name ?? null,
    submittedBy: expense.submitted_by,
    submitterName: submitter.data
      ? `${submitter.data.first_name} ${submitter.data.last_name}`.trim()
      : null,
    assignedApprover: expense.assigned_approver,
    partnerId: expense.partner_id,
    partnerName: partner.data?.name ?? null,
    logs,
    groupCostCenters,
    reconciledLines: reconciledChildren,
  };
}

async function getGroupCostCenters(budgetLineId: string) {
  const supabase = await createClient();
  const { data: budgetLine } = await supabase
    .from("budget_lines")
    .select("group_id")
    .eq("id", budgetLineId)
    .maybeSingle();
  if (!budgetLine) return [];

  // Two-step lookup rather than a nested select — without generated types,
  // supabase-js can't infer the join's cardinality, which made the nested
  // shape ({ cost_centers(...) }) type-check as an array of arrays.
  const { data: members } = await supabase
    .from("cost_center_group_members")
    .select("cost_center_id")
    .eq("group_id", budgetLine.group_id);
  const costCenterIds = (members ?? []).map((m) => m.cost_center_id);
  if (costCenterIds.length === 0) return [];

  const { data: costCenters } = await supabase
    .from("cost_centers")
    .select("id, code, name")
    .in("id", costCenterIds);

  return costCenters ?? [];
}

async function getLogs(expenseId: string): Promise<ExpenseLogEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("approval_logs")
    .select("id, actor_id, action, note, created_at")
    .eq("expense_id", expenseId)
    .order("created_at", { ascending: true });

  const rows = data ?? [];
  const actorIds = [...new Set(rows.map((r) => r.actor_id))];
  const { data: actors } = actorIds.length
    ? await supabase.from("users").select("id, first_name, last_name").in("id", actorIds)
    : { data: [] as { id: string; first_name: string; last_name: string }[] };
  const nameById = new Map(
    (actors ?? []).map((a) => [a.id, `${a.first_name} ${a.last_name}`.trim()]),
  );

  return rows.map((r) => ({
    id: r.id,
    actorId: r.actor_id,
    actorName: nameById.get(r.actor_id) ?? null,
    action: r.action,
    note: r.note,
    at: r.created_at,
  }));
}

async function getReconciledLines(advanceExpenseId: string): Promise<ReconciledLine[]> {
  const supabase = await createClient();
  const { data: children } = await supabase
    .from("expenses")
    .select("id, description, amount, cost_center_id")
    .eq("reconciles_advance_id", advanceExpenseId);
  if (!children?.length) return [];

  const ids = children.map((c) => c.id);
  const costCenterIds = [...new Set(children.map((c) => c.cost_center_id).filter(Boolean))];

  const [{ data: details }, { data: costCenters }] = await Promise.all([
    supabase
      .from("expense_accounting_details")
      .select("expense_id, net_amount, vat_rate")
      .in("expense_id", ids),
    costCenterIds.length
      ? supabase.from("cost_centers").select("id, code, name").in("id", costCenterIds)
      : Promise.resolve({ data: [] as { id: string; code: string; name: string }[] }),
  ]);

  const detailByExpenseId = new Map((details ?? []).map((d) => [d.expense_id, d]));
  const costCenterById = new Map((costCenters ?? []).map((c) => [c.id, c]));

  return children.map((c) => {
    const detail = detailByExpenseId.get(c.id);
    const cc = c.cost_center_id ? costCenterById.get(c.cost_center_id) : undefined;
    return {
      id: c.id,
      costCenterCode: cc?.code ?? null,
      costCenterName: cc?.name ?? null,
      description: c.description,
      netAmount: detail ? Number(detail.net_amount) : 0,
      vatRate: detail ? Number(detail.vat_rate) : 0,
      grossAmount: Number(c.amount),
    };
  });
}
