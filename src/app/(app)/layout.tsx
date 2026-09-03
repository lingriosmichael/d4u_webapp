import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentUserProfile } from "@/lib/supabase/queries/current-user";
import { RoleProvider } from "@/lib/role-context";
import { AppShell } from "@/components/app-shell";

// Every route under this group requires a real, active Supabase Auth user
// with a matching public.users row (RLS depends on it — see
// documentation/0001_rls_policies.sql). middleware.ts also redirects
// unauthenticated requests before they get here; this check stays as a
// second, request-independent guard rather than relying on middleware alone.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUserProfile();
  if (!user) redirect("/login");

  return (
    <RoleProvider user={user}>
      <AppShell>{children}</AppShell>
    </RoleProvider>
  );
}
