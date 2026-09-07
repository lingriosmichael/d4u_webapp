import type { Metadata } from "next";
import { getCurrentUserProfile } from "@/lib/supabase/queries/current-user";
import {
  getAdminUsers,
  getAdminProjects,
  getAdminCostCenters,
  getAdminGroups,
  getAdminBudgetLines,
  getAdminPartners,
  getAdminSettings,
  getAdminAuditLog,
} from "@/lib/supabase/queries/admin";
import { AdminPage } from "./admin-view";

export const metadata: Metadata = {
  title: "Administration — D4U Finance",
  robots: { index: false, follow: false },
};

export default async function Page() {
  const profile = await getCurrentUserProfile();

  // Skip the (RLS-restricted, admin-only) queries entirely for a non-admin
  // — AdminPage's own role check (against the same profile, via
  // role-context) renders the "access denied" message either way; no point
  // running admin_audit_log/users queries that RLS would mostly empty out
  // for this viewer regardless.
  if (profile?.role !== "admin") {
    return (
      <AdminPage
        users={[]}
        projects={[]}
        costCenters={[]}
        groups={[]}
        budgetLines={[]}
        partners={[]}
        settings={[]}
        auditLog={[]}
      />
    );
  }

  const [users, projects, costCenters, groups, budgetLines, partners, settings, auditLog] =
    await Promise.all([
      getAdminUsers(),
      getAdminProjects(),
      getAdminCostCenters(),
      getAdminGroups(),
      getAdminBudgetLines(),
      getAdminPartners(),
      getAdminSettings(),
      getAdminAuditLog(),
    ]);

  return (
    <AdminPage
      users={users}
      projects={projects}
      costCenters={costCenters}
      groups={groups}
      budgetLines={budgetLines}
      partners={partners}
      settings={settings}
      auditLog={auditLog}
    />
  );
}
