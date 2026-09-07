import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ExpenseStatus, Role } from "@/lib/mock-data";
import { isApprovalStageReviewer } from "@/lib/approval-stage-role";

// Data-access layer for the Übersicht (dashboard) screen. Column names come
// from documentation/0001_rls_policies.sql (ground truth for the columns it
// references) cross-checked against the implementation doc's data model for
// the rest — not yet against generated types (database.types.ts doesn't
// exist yet, see src/lib/supabase/client.ts for the codegen command).
//
// Soll/Ist/Obligo: budget_lines.allocated_amount / consumed_amount /
// obligo_amount are written only by backend RPCs — this file sums those
// already-authoritative per-line figures up to project level for display.
// It does NOT derive Ist/Obligo from expense rows itself; that's the
// client-side recalculation the frontend CLAUDE.md explicitly forbids.

export interface DashboardProject {
  id: string;
  code: string;
  name: string;
  leadUserId: string | null;
}

export interface DashboardBudgetStatus {
  projectId: string;
  soll: number;
  ist: number;
  obligo: number;
}

export interface DashboardExpense {
  id: string;
  projectId: string;
  amount: number;
  description: string;
  status: ExpenseStatus;
  createdAt: string;
  submittedBy: string;
  submittedByName: string | null;
  partnerId: string | null;
  partnerName: string | null;
}

export async function getDashboardProjects(): Promise<DashboardProject[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, code, name, lead_user_id")
    .order("code");

  if (error) throw error;

  return (data ?? []).map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    leadUserId: p.lead_user_id,
  }));
}

export async function getDashboardBudgetStatus(): Promise<DashboardBudgetStatus[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("budget_lines")
    .select("project_id, allocated_amount, consumed_amount, obligo_amount");

  if (error) throw error;

  const byProject = new Map<string, DashboardBudgetStatus>();
  for (const row of data ?? []) {
    const existing = byProject.get(row.project_id) ?? {
      projectId: row.project_id,
      soll: 0,
      ist: 0,
      obligo: 0,
    };
    existing.soll += row.allocated_amount ?? 0;
    existing.ist += row.consumed_amount ?? 0;
    existing.obligo += row.obligo_amount ?? 0;
    byProject.set(row.project_id, existing);
  }
  return [...byProject.values()];
}

export async function getDashboardExpenses(): Promise<DashboardExpense[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("expenses")
    .select("id, project_id, amount, description, status, created_at, submitted_by, partner_id")
    .order("created_at", { ascending: false });

  if (error) throw error;
  const expenses = data ?? [];

  // `users_select_org_wide` (supabase/migrations/0010, d4u_backend) covers
  // finance_manager/accounting/ceo/admin reading any submitter's name; a
  // project_manager additionally sees the submitter's name for any expense
  // on a project they lead. A viewer outside both of those still
  // legitimately gets an empty result for someone else's row —
  // submittedByName degrades to null rather than erroring.
  const submitterIds = [...new Set(expenses.map((e) => e.submitted_by).filter(Boolean))];
  const partnerIds = [...new Set(expenses.map((e) => e.partner_id).filter(Boolean))];

  const [{ data: users }, { data: partners }] = await Promise.all([
    submitterIds.length
      ? supabase.from("users").select("id, first_name, last_name").in("id", submitterIds)
      : Promise.resolve({ data: [] as { id: string; first_name: string; last_name: string }[] }),
    partnerIds.length
      ? supabase.from("partners").select("id, name").in("id", partnerIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const userNameById = new Map(
    (users ?? []).map((u) => [u.id, `${u.first_name} ${u.last_name}`.trim()]),
  );
  const partnerNameById = new Map((partners ?? []).map((p) => [p.id, p.name]));

  return expenses.map((e) => ({
    id: e.id,
    projectId: e.project_id,
    amount: e.amount,
    description: e.description,
    status: e.status as ExpenseStatus,
    createdAt: e.created_at,
    submittedBy: e.submitted_by,
    submittedByName: userNameById.get(e.submitted_by) ?? null,
    partnerId: e.partner_id,
    partnerName: e.partner_id ? (partnerNameById.get(e.partner_id) ?? null) : null,
  }));
}

/** Mirrors d4u_backend's real authorization (see approval-stage-role.ts):
 * the role whose approval stage an expense is currently at, or accounting
 * reviewing an unverified partner advance. */
export function needsActionFor(
  expenses: DashboardExpense[],
  currentUserRole: Role,
): DashboardExpense[] {
  return expenses.filter((e) => {
    if (currentUserRole === "accounting" && e.status === "submitted_unverified") return true;
    return isApprovalStageReviewer(e.status, currentUserRole);
  });
}
