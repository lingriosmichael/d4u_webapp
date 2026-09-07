import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentUserProfile, getMustChangePassword } from "@/lib/supabase/queries/current-user";
import { getDashboardExpenses, needsActionFor } from "@/lib/supabase/queries/dashboard";
import { RoleProvider } from "@/lib/role-context";
import { AppShell } from "@/components/layout/app-shell";

// Every route under this group requires a real, active Supabase Auth user
// with a matching public.users row (RLS depends on it — see
// documentation/0001_rls_policies.sql). middleware.ts also redirects
// unauthenticated requests before they get here; this check stays as a
// second, request-independent guard rather than relying on middleware alone.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUserProfile();
  if (!user) redirect("/login");

  // Admin-assigned temp password (Verwaltung -> Nutzer anlegen) must be
  // changed before anything else is reachable — checked on every request
  // to this route group, same as the active-user check above.
  if (await getMustChangePassword()) redirect("/password-aendern");

  // Sidebar's pending-action badge — fetched here (Server Component,
  // real data) rather than in AppShell itself, since AppShell is a client
  // component. Previously called mock-data.ts's fixture-based
  // needsActionFor(user), which matched against assigned_approver — a
  // column no route ever writes (see approval-stage-role.ts) — so the
  // badge was permanently disconnected from real pending items. This
  // duplicates the same query dashboard-view.tsx runs for Übersicht
  // itself; an accepted small inefficiency (one extra read per page load)
  // rather than a shared-cache layer this app's scale doesn't need yet.
  const expenses = await getDashboardExpenses();
  const pendingCount = needsActionFor(expenses, user.role).length;

  return (
    <RoleProvider user={user}>
      <AppShell pendingCount={pendingCount}>{children}</AppShell>
    </RoleProvider>
  );
}
