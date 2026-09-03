import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/mock-data";

// Data-access layer for Verwaltung (Admin) — reads only; every write still
// goes through d4u_backend's admin CRUD routes (src/lib/api.ts's
// admin.*.upsert endpoints), never direct Supabase writes, per this
// frontend's non-negotiable rule. Uses the cookie-scoped server client
// (respects RLS as the signed-in admin), not the service-role key — same
// pattern as dashboard.ts and expense-detail.ts.

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  initials: string;
}

export interface AdminProject {
  id: string;
  code: string;
  name: string;
  fundingProgram: string | null;
  status: string;
  leadUserId: string | null;
  leadUserName: string | null;
  startDate: string | null;
  endDate: string | null;
}

export interface AdminCostCenter {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

export interface AdminGroup {
  id: string;
  projectId: string;
  name: string;
  costCenterIds: string[];
}

export interface AdminBudgetLine {
  id: string;
  projectId: string;
  projectName: string | null;
  groupId: string;
  groupName: string | null;
  allocated: number;
  warningThresholdPct: number;
}

export interface AdminPartner {
  id: string;
  name: string;
  contactEmail: string | null;
  active: boolean;
}

export interface AdminSetting {
  key: string;
  value: unknown;
}

export interface AdminAuditLogEntry {
  id: string;
  at: string;
  actorName: string | null;
  table: string;
  recordId: string;
  action: "insert" | "update" | "delete";
  summary: string;
}

export async function getAdminUsers(): Promise<AdminUser[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("users")
    .select("id, email, first_name, last_name, role, active")
    .order("last_name");

  return (data ?? []).map((u) => ({
    id: u.id,
    name: `${u.first_name} ${u.last_name}`.trim(),
    email: u.email,
    role: u.role,
    active: u.active,
    initials: [u.first_name, u.last_name]
      .map((p: string) => p?.[0] ?? "")
      .join("")
      .toUpperCase(),
  }));
}

export async function getAdminProjects(): Promise<AdminProject[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("id, code, name, funding_program, status, lead_user_id, start_date, end_date")
    .order("code");
  const rows = data ?? [];

  const leadIds = [...new Set(rows.map((p) => p.lead_user_id).filter(Boolean))];
  const { data: leads } = leadIds.length
    ? await supabase.from("users").select("id, first_name, last_name").in("id", leadIds)
    : { data: [] as { id: string; first_name: string; last_name: string }[] };
  const leadNameById = new Map(
    (leads ?? []).map((u) => [u.id, `${u.first_name} ${u.last_name}`.trim()]),
  );

  return rows.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    fundingProgram: p.funding_program,
    status: p.status,
    leadUserId: p.lead_user_id,
    leadUserName: p.lead_user_id ? (leadNameById.get(p.lead_user_id) ?? null) : null,
    startDate: p.start_date,
    endDate: p.end_date,
  }));
}

export async function getAdminCostCenters(): Promise<AdminCostCenter[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cost_centers")
    .select("id, code, name, active")
    .order("code");
  return data ?? [];
}

export async function getAdminGroups(): Promise<AdminGroup[]> {
  const supabase = await createClient();
  const { data: groups } = await supabase
    .from("cost_center_groups")
    .select("id, project_id, name")
    .order("name");
  const rows = groups ?? [];
  if (rows.length === 0) return [];

  const { data: members } = await supabase
    .from("cost_center_group_members")
    .select("group_id, cost_center_id")
    .in(
      "group_id",
      rows.map((g) => g.id),
    );

  const costCenterIdsByGroup = new Map<string, string[]>();
  for (const m of members ?? []) {
    const list = costCenterIdsByGroup.get(m.group_id) ?? [];
    list.push(m.cost_center_id);
    costCenterIdsByGroup.set(m.group_id, list);
  }

  return rows.map((g) => ({
    id: g.id,
    projectId: g.project_id,
    name: g.name,
    costCenterIds: costCenterIdsByGroup.get(g.id) ?? [],
  }));
}

export async function getAdminBudgetLines(): Promise<AdminBudgetLine[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("budget_lines")
    .select("id, project_id, group_id, allocated_amount, warning_threshold_pct");
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const projectIds = [...new Set(rows.map((b) => b.project_id))];
  const groupIds = [...new Set(rows.map((b) => b.group_id))];
  const [{ data: projects }, { data: groups }] = await Promise.all([
    supabase.from("projects").select("id, name").in("id", projectIds),
    supabase.from("cost_center_groups").select("id, name").in("id", groupIds),
  ]);
  const projectNameById = new Map((projects ?? []).map((p) => [p.id, p.name]));
  const groupNameById = new Map((groups ?? []).map((g) => [g.id, g.name]));

  return rows.map((b) => ({
    id: b.id,
    projectId: b.project_id,
    projectName: projectNameById.get(b.project_id) ?? null,
    groupId: b.group_id,
    groupName: groupNameById.get(b.group_id) ?? null,
    allocated: Number(b.allocated_amount),
    warningThresholdPct: Number(b.warning_threshold_pct),
  }));
}

export async function getAdminPartners(): Promise<AdminPartner[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("partners")
    .select("id, name, contact_email, active")
    .order("name");
  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    contactEmail: p.contact_email,
    active: p.active,
  }));
}

export async function getAdminSettings(): Promise<AdminSetting[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("key, value");
  return data ?? [];
}

export async function getAdminAuditLog(): Promise<AdminAuditLogEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("admin_audit_log")
    .select("id, actor_id, table_name, record_id, action, summary, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const actorIds = [...new Set(rows.map((r) => r.actor_id))];
  const { data: actors } = actorIds.length
    ? await supabase.from("users").select("id, first_name, last_name").in("id", actorIds)
    : { data: [] as { id: string; first_name: string; last_name: string }[] };
  const nameById = new Map(
    (actors ?? []).map((a) => [a.id, `${a.first_name} ${a.last_name}`.trim()]),
  );

  return rows.map((r) => ({
    id: r.id,
    at: r.created_at,
    actorName: nameById.get(r.actor_id) ?? null,
    table: r.table_name,
    recordId: r.record_id,
    action: r.action,
    summary: r.summary,
  }));
}
