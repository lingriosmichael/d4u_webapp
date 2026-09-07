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
  // Kept alongside the combined `name` (used for display) so the edit form
  // can populate its first_name/last_name fields directly instead of
  // splitting `name` back apart on whitespace — a multi-word first or last
  // name (common in German names, e.g. "Anna Lena", "von Berg") would
  // otherwise be misattributed on save.
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  // Added 2026-09-05 (documentation/approval_routing.md §2) — a SUBMITTER
  // attribute: the amount above which this user's own submissions require
  // CEO review before Accounting. NOT NULL DEFAULT 0 in the schema.
  approvalLimit: number;
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
  // Derived, not stored — see getAdminAuditLog()'s comment. admin_audit_log
  // has no `action` column; this is inferred from change_summary's shape.
  action: "insert" | "update" | "delete";
  summary: string;
}

export async function getAdminUsers(): Promise<AdminUser[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("users")
    .select("id, email, first_name, last_name, role, active, approval_limit")
    .order("last_name");

  return (data ?? []).map((u) => ({
    id: u.id,
    name: `${u.first_name} ${u.last_name}`.trim(),
    firstName: u.first_name,
    lastName: u.last_name,
    email: u.email,
    role: u.role,
    approvalLimit: Number(u.approval_limit),
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

// settings.value is a text column, not jsonb — verified live (2026-09-03):
// a stored `1000` round-trips as the string "1000", a stored `false` as the
// string "false". Without parsing, SettingsTab's `typeof s.value ===
// "boolean"` check (admin-view.tsx) is always false, so a boolean setting
// like advance_requires_ceo_approval rendered as a text box showing the
// literal word "false" instead of a switch. Parsed here, once, rather than
// re-deriving the type at every render site.
function parseSettingValue(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  if (raw === "true") return true;
  if (raw === "false") return false;
  const num = Number(raw);
  if (raw.trim() !== "" && Number.isFinite(num)) return num;
  return raw;
}

export async function getAdminSettings(): Promise<AdminSetting[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("settings").select("key, value");
  return (data ?? []).map((s) => ({ key: s.key, value: parseSettingValue(s.value) }));
}

// admin_audit_log is populated by a database trigger, not application code
// (verified 2026-09-03 — see d4u_backend/src/lib/audit-log.ts's comment for
// the full story). Its real columns are id, actor_id, table_name,
// record_id, change_summary (jsonb: `{new}` for an insert, `{old, new}`
// for an update, presumably `{old}` for a delete — not yet observed), and
// created_at. There is no `action` or `summary` column — both are derived
// here, not stored.
type ChangeSummary = { old?: Record<string, unknown>; new?: Record<string, unknown> };

function deriveAction(cs: ChangeSummary): "insert" | "update" | "delete" {
  if (cs.old && cs.new) return "update";
  if (cs.new) return "insert";
  return "delete";
}

function summarize(cs: ChangeSummary): string {
  if (cs.old && cs.new) {
    const changed = Object.keys(cs.new).filter(
      (k) => JSON.stringify(cs.new![k]) !== JSON.stringify(cs.old![k]),
    );
    if (changed.length === 0) return "Keine erkennbaren Feldänderungen";
    return changed.map((k) => `${k}: ${fmtValue(cs.old![k])} → ${fmtValue(cs.new![k])}`).join(", ");
  }
  const row = cs.new ?? cs.old ?? {};
  return Object.entries(row)
    .filter(([k]) => !["id", "created_at", "updated_at"].includes(k))
    .map(([k, v]) => `${k}: ${fmtValue(v)}`)
    .join(", ");
}

function fmtValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  return String(v);
}

export async function getAdminAuditLog(): Promise<AdminAuditLogEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("admin_audit_log")
    .select("id, actor_id, table_name, record_id, change_summary, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const actorIds = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))];
  const { data: actors } = actorIds.length
    ? await supabase.from("users").select("id, first_name, last_name").in("id", actorIds)
    : { data: [] as { id: string; first_name: string; last_name: string }[] };
  const nameById = new Map(
    (actors ?? []).map((a) => [a.id, `${a.first_name} ${a.last_name}`.trim()]),
  );

  return rows.map((r) => {
    const cs = (r.change_summary ?? {}) as ChangeSummary;
    return {
      id: r.id,
      at: r.created_at,
      actorName: r.actor_id ? (nameById.get(r.actor_id) ?? null) : null,
      table: r.table_name,
      recordId: r.record_id,
      action: deriveAction(cs),
      summary: summarize(cs),
    };
  });
}
