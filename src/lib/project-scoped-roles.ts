import type { Role } from "@/lib/mock-data";

// Roles that only see and submit to projects they lead (projects.lead_user_id)
// plus their own submissions. Mirrors d4u_backend's PROJECT_SCOPED_ROLES
// (src/types/domain.ts) and its migration 0032: finance_manager joined
// project_manager here on 2026-10-13 (implementer decision pending D4U's
// confirmation) — it no longer approves anything, so it no longer sees the
// whole organisation either. The database enforces the same scope through
// RLS; this list only decides which projects a screen offers or summarises.
export const PROJECT_SCOPED_ROLES: ReadonlySet<Role> = new Set<Role>([
  "project_manager",
  "finance_manager",
]);

export function isProjectScopedRole(role: Role): boolean {
  return PROJECT_SCOPED_ROLES.has(role);
}

/** The projects a user may see or submit to: all of them for Accounting,
 * CEO and Admin; only the ones they lead for a project-scoped role. */
export function projectsVisibleTo<P extends { leadUserId: string | null }>(
  user: { id: string; role: Role },
  projects: P[],
): P[] {
  return isProjectScopedRole(user.role)
    ? projects.filter((p) => p.leadUserId === user.id)
    : projects;
}
