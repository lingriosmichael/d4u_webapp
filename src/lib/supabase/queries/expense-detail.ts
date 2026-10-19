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
  /** null when the viewer may not read the line's accounting details. */
  netAmount: number | null;
  vatRate: number | null;
  grossAmount: number;
}

/** One correction of a paid expense (d4u_backend migration 0038,
 * expense_corrections): what changed, why, and its document. */
export interface ExpenseCorrection {
  id: string;
  correctedAt: string;
  correctedByName: string | null;
  reason: string;
  documentRef: string;
  oldAmount: number;
  newAmount: number;
  oldNetAmount: number | null;
  newNetAmount: number;
  oldVatRate: number | null;
  newVatRate: number;
  oldInvoiceNumber: string | null;
  newInvoiceNumber: string | null;
  oldInvoiceDate: string | null;
  newInvoiceDate: string | null;
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
  /** "YYYY-MM-DD"; null for partner advances, Vorschuss line items and
   * expenses from before d4u_backend migration 0036. */
  invoiceDate: string | null;
  /** Buchhaltungsnotiz (d4u_backend migration 0037): written by Accounting,
   * readable by everyone who can read the expense. */
  accountingNote: string | null;
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
  /** The budget line this expense books on, for the correction form's
   * preview of how Ist changes. Display only: the RPC moves the money. */
  budgetLine: { allocated: number; consumed: number; obligo: number } | null;
  /** Net amount and VAT rate as Accounting entered them when marking it
   * paid; null before that, and for everyone RLS doesn't let read
   * expense_accounting_details (only Accounting and above). */
  paymentDetails: { netAmount: number | null; vatRate: number | null } | null;
  /** Corrections after payment, oldest first. */
  corrections: ExpenseCorrection[];
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
    .select("group_id, allocated_amount, consumed_amount, obligo_amount")
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
    paymentDetails,
    corrections,
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
    supabase
      .from("expense_accounting_details")
      .select("net_amount, vat_rate")
      .eq("expense_id", id)
      .maybeSingle(),
    getCorrections(id),
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
    invoiceDate: expense.invoice_date ?? null,
    accountingNote: expense.accounting_note ?? null,
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
    budgetLine: budgetLine
      ? {
          allocated: Number(budgetLine.allocated_amount),
          consumed: Number(budgetLine.consumed_amount),
          obligo: Number(budgetLine.obligo_amount),
        }
      : null,
    paymentDetails: paymentDetails.data
      ? {
          netAmount: numberOrNull(paymentDetails.data.net_amount),
          vatRate: numberOrNull(paymentDetails.data.vat_rate),
        }
      : null,
    corrections,
  };
}

function numberOrNull(value: unknown): number | null {
  return value == null ? null : Number(value);
}

/** "First Last" for each user id the reader may see (RLS); missing ids
 * are simply absent from the map. */
async function getUserNames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.from("users").select("id, first_name, last_name").in("id", ids);
  return new Map((data ?? []).map((u) => [u.id, `${u.first_name} ${u.last_name}`.trim()]));
}

async function getCorrections(expenseId: string): Promise<ExpenseCorrection[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("expense_corrections")
    .select("*")
    .eq("expense_id", expenseId)
    .order("corrected_at", { ascending: true });

  const rows = data ?? [];
  const nameById = await getUserNames([...new Set(rows.map((r) => r.corrected_by as string))]);

  return rows.map((r) => ({
    id: r.id,
    correctedAt: r.corrected_at,
    correctedByName: nameById.get(r.corrected_by) ?? null,
    reason: r.reason,
    documentRef: r.document_ref,
    oldAmount: Number(r.old_amount),
    newAmount: Number(r.new_amount),
    oldNetAmount: numberOrNull(r.old_net_amount),
    newNetAmount: Number(r.new_net_amount),
    oldVatRate: numberOrNull(r.old_vat_rate),
    newVatRate: Number(r.new_vat_rate),
    oldInvoiceNumber: r.old_invoice_number,
    newInvoiceNumber: r.new_invoice_number,
    oldInvoiceDate: r.old_invoice_date,
    newInvoiceDate: r.new_invoice_date,
  }));
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
  const nameById = await getUserNames([...new Set(rows.map((r) => r.actor_id))]);

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
      netAmount: detail ? numberOrNull(detail.net_amount) : null,
      vatRate: detail ? numberOrNull(detail.vat_rate) : null,
      grossAmount: Number(c.amount),
    };
  });
}
