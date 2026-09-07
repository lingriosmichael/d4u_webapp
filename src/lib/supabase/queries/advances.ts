import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ExpenseStatus } from "@/lib/mock-data";

// Data-access layer for the new "Vorschüsse" tab (split-advance
// reconciliation flow, migrations 0017/0018) — read-only, RLS-scoped,
// same pattern as expense-detail.ts. Every write for this flow goes
// through the backend (advances.split, expenses.attachReceipt,
// advances.submitForReconciliation, expenses.reconcile), never a direct
// Supabase write from here.

export interface OpenAdvanceSummary {
  id: string;
  status: ExpenseStatus;
  amount: number;
  description: string;
  createdAt: string;
  projectName: string | null;
  partnerName: string | null;
  submitterName: string | null;
  childCount: number;
  childrenWithReceiptCount: number;
}

async function toSummaries(rows: Array<Record<string, unknown>>): Promise<OpenAdvanceSummary[]> {
  const supabase = await createClient();
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id as string);
  const projectIds = [...new Set(rows.map((r) => r.project_id as string))];
  const partnerIds = [...new Set(rows.map((r) => r.partner_id).filter(Boolean) as string[])];
  const submitterIds = [...new Set(rows.map((r) => r.submitted_by as string))];

  const [{ data: projects }, { data: partners }, { data: submitters }, { data: children }] =
    await Promise.all([
      supabase.from("projects").select("id, name").in("id", projectIds),
      partnerIds.length
        ? supabase.from("partners").select("id, name").in("id", partnerIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      supabase.from("users").select("id, first_name, last_name").in("id", submitterIds),
      supabase
        .from("expenses")
        .select("id, reconciles_advance_id, receipt_status")
        .in("reconciles_advance_id", ids),
    ]);

  const projectById = new Map((projects ?? []).map((p) => [p.id, p.name]));
  const partnerById = new Map((partners ?? []).map((p) => [p.id, p.name]));
  const submitterById = new Map(
    (submitters ?? []).map((s) => [s.id, `${s.first_name} ${s.last_name}`.trim()]),
  );

  return rows.map((r) => {
    const advanceChildren = (children ?? []).filter((c) => c.reconciles_advance_id === r.id);
    return {
      id: r.id as string,
      status: r.status as ExpenseStatus,
      amount: Number(r.amount),
      description: r.description as string,
      createdAt: r.created_at as string,
      projectName: projectById.get(r.project_id as string) ?? null,
      partnerName: r.partner_id ? (partnerById.get(r.partner_id as string) ?? null) : null,
      submitterName: submitterById.get(r.submitted_by as string) ?? null,
      childCount: advanceChildren.length,
      childrenWithReceiptCount: advanceChildren.filter((c) => c.receipt_status === "attached")
        .length,
    };
  });
}

/** Advances the current user submitted themselves, not yet reconciled --
 * the primary content of the new tab for a PM/submitter. */
export async function getMyOpenAdvances(userId: string): Promise<OpenAdvanceSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("expenses")
    .select("*")
    .eq("expense_type", "partner_advance")
    .eq("submitted_by", userId)
    .in("status", [
      "submitted_unverified",
      "reconciliation_in_progress",
      "reconciliation_submitted",
    ])
    .order("created_at", { ascending: false });

  return toSummaries(data ?? []);
}

/** Advances any submitter has handed off, awaiting Accounting's final
 * confirm -- the same tab's Accounting-only queue section. */
export async function getAdvancesAwaitingConfirmation(): Promise<OpenAdvanceSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("expenses")
    .select("*")
    .eq("expense_type", "partner_advance")
    .eq("status", "reconciliation_submitted")
    .order("updated_at", { ascending: true });

  return toSummaries(data ?? []);
}

export interface AdvanceChildLine {
  id: string;
  status: ExpenseStatus;
  description: string;
  amount: number;
  receiptStatus: string;
  documentRef: string | null;
  costCenterId: string | null;
  costCenterCode: string | null;
  costCenterName: string | null;
  localAmount: number | null;
  exchangeRate: number | null;
  bookingKey: string | null;
  vatRate: number | null;
  netAmount: number | null;
  kskLiable: boolean | null;
}

export interface AdvanceReconciliationDetail {
  id: string;
  status: ExpenseStatus;
  amount: number;
  description: string;
  submittedBy: string;
  projectId: string;
  projectName: string | null;
  projectCode: string | null;
  budgetLineId: string;
  groupId: string;
  partnerName: string | null;
  groupCostCenters: Array<{ id: string; code: string; name: string }>;
  children: AdvanceChildLine[];
}

export async function getAdvanceReconciliationDetail(
  id: string,
): Promise<AdvanceReconciliationDetail | null> {
  const supabase = await createClient();
  const { data: advance, error } = await supabase
    .from("expenses")
    .select("*")
    .eq("id", id)
    .eq("expense_type", "partner_advance")
    .single();
  if (error || !advance) return null;

  const { data: budgetLine } = await supabase
    .from("budget_lines")
    .select("group_id")
    .eq("id", advance.budget_line_id)
    .maybeSingle();
  const groupId = budgetLine?.group_id ?? "";

  const [{ data: project }, { data: partner }, { data: members }, { data: children }] =
    await Promise.all([
      supabase.from("projects").select("name, code").eq("id", advance.project_id).maybeSingle(),
      advance.partner_id
        ? supabase.from("partners").select("name").eq("id", advance.partner_id).maybeSingle()
        : Promise.resolve({ data: null }),
      groupId
        ? supabase
            .from("cost_center_group_members")
            .select("cost_center_id")
            .eq("group_id", groupId)
        : Promise.resolve({ data: [] as { cost_center_id: string }[] }),
      supabase
        .from("expenses")
        .select("*")
        .eq("reconciles_advance_id", id)
        .order("created_at", { ascending: true }),
    ]);

  const costCenterIds = (members ?? []).map((m) => m.cost_center_id);
  const { data: costCenters } = costCenterIds.length
    ? await supabase.from("cost_centers").select("id, code, name").in("id", costCenterIds)
    : { data: [] as { id: string; code: string; name: string }[] };
  const costCenterById = new Map((costCenters ?? []).map((c) => [c.id, c]));

  const childIds = (children ?? []).map((c) => c.id);
  const { data: details } = childIds.length
    ? await supabase.from("expense_accounting_details").select("*").in("expense_id", childIds)
    : { data: [] as Record<string, unknown>[] };
  const detailByExpenseId = new Map((details ?? []).map((d) => [d.expense_id as string, d]));

  return {
    id: advance.id,
    status: advance.status,
    amount: Number(advance.amount),
    description: advance.description,
    submittedBy: advance.submitted_by,
    projectId: advance.project_id,
    projectName: project?.name ?? null,
    projectCode: project?.code ?? null,
    budgetLineId: advance.budget_line_id,
    groupId,
    partnerName: partner?.name ?? null,
    groupCostCenters: (costCenters ?? []) as Array<{ id: string; code: string; name: string }>,
    children: (children ?? []).map((c) => {
      const d = detailByExpenseId.get(c.id);
      const cc = c.cost_center_id ? costCenterById.get(c.cost_center_id) : undefined;
      return {
        id: c.id,
        status: c.status,
        description: c.description,
        amount: Number(c.amount),
        receiptStatus: c.receipt_status,
        documentRef: c.document_ref,
        costCenterId: c.cost_center_id,
        costCenterCode: cc?.code ?? null,
        costCenterName: cc?.name ?? null,
        localAmount: d?.local_amount != null ? Number(d.local_amount) : null,
        exchangeRate: d?.exchange_rate != null ? Number(d.exchange_rate) : null,
        bookingKey: (d?.booking_key as string) ?? null,
        vatRate: d?.vat_rate != null ? Number(d.vat_rate) : null,
        netAmount: d?.net_amount != null ? Number(d.net_amount) : null,
        kskLiable: (d?.ksk_liable as boolean) ?? null,
      };
    }),
  };
}
