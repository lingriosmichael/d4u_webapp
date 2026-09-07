import "server-only";
import { createClient } from "@/lib/supabase/server";

// Data-access layer for Beleg-Upload's dropdowns (project → Kostenstellen-
// Gruppe → Kostenstelle, plus partners). Read-only — the actual submission
// still goes through d4u_backend's POST /api/expenses, never a direct
// Supabase write, per this frontend's non-negotiable rule. Same two-step
// group-members fetch used in visualization.ts/admin.ts to avoid the
// nested-select typing issue.
//
// Each group carries its budgetLineId because `POST /api/expenses` takes
// `budgetLineId`, not a group id — a budget_line is the (project, group)
// pair the group selector actually stands for. Only "active" projects are
// offered here (submitting a new expense against a closed/on_hold project
// isn't a meaningful action), unlike Auswertung/Verwaltung's reads, which
// intentionally show every project.

export interface UploadCostCenter {
  id: string;
  code: string;
  name: string;
}

export interface UploadGroup {
  id: string;
  projectId: string;
  name: string;
  budgetLineId: string;
  costCenters: UploadCostCenter[];
}

export interface UploadProject {
  id: string;
  code: string;
  name: string;
  leadUserId: string | null;
  groups: UploadGroup[];
}

export interface UploadPartner {
  id: string;
  name: string;
}

export interface UploadOptions {
  projects: UploadProject[];
  partners: UploadPartner[];
}

export async function getUploadOptions(): Promise<UploadOptions> {
  const supabase = await createClient();

  const [{ data: projects }, { data: groups }, { data: budgetLines }, { data: partners }] =
    await Promise.all([
      supabase
        .from("projects")
        .select("id, code, name, lead_user_id")
        .eq("status", "active")
        .order("code"),
      supabase.from("cost_center_groups").select("id, project_id, name").order("name"),
      supabase.from("budget_lines").select("id, project_id, group_id"),
      supabase.from("partners").select("id, name").eq("active", true).order("name"),
    ]);

  const groupRows = groups ?? [];
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
    : { data: [] as UploadCostCenter[] };
  const costCenterById = new Map((costCenters ?? []).map((c) => [c.id, c]));

  const budgetLineIdByProjectGroup = new Map(
    (budgetLines ?? []).map((b) => [`${b.project_id}:${b.group_id}`, b.id]),
  );

  const groupsByProject = new Map<string, UploadGroup[]>();
  for (const g of groupRows) {
    const budgetLineId = budgetLineIdByProjectGroup.get(`${g.project_id}:${g.id}`);
    if (!budgetLineId) continue; // group has no budget allocated yet — not selectable
    const list = groupsByProject.get(g.project_id) ?? [];
    list.push({
      id: g.id,
      projectId: g.project_id,
      name: g.name,
      budgetLineId,
      costCenters: (costCenterIdsByGroup.get(g.id) ?? [])
        .map((id) => costCenterById.get(id))
        .filter((c): c is UploadCostCenter => !!c),
    });
    groupsByProject.set(g.project_id, list);
  }

  return {
    projects: (projects ?? []).map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      leadUserId: p.lead_user_id,
      groups: groupsByProject.get(p.id) ?? [],
    })),
    partners: partners ?? [],
  };
}
