import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@/lib/mock-data";

// Resolves the signed-in Supabase Auth user to their public.users profile
// row (role, active status). Returns null if there's no session, or if the
// auth user has no matching (or inactive) public.users row — both cases the
// caller should treat as "not signed in" and redirect to /login.
//
// Column names (first_name, last_name, role, active) come from
// documentation/0001_rls_policies.sql, which is ground truth (it's the
// actual predicate SQL, not paraphrase) — not yet cross-checked against
// generated types, since database.types.ts doesn't exist. See
// src/lib/supabase/client.ts for the exact `supabase gen types` command to
// run; once that lands, replace this hand-typed shape with the real one.
export async function getCurrentUserProfile(): Promise<User | null> {
  const supabase = await createClient();

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return null;

  const { data, error } = await supabase
    .from("users")
    .select("id, email, first_name, last_name, role, active")
    .eq("id", authUser.id)
    .single();

  if (error || !data || !data.active) return null;

  const initials = [data.first_name, data.last_name]
    .map((part: string) => part?.[0] ?? "")
    .join("")
    .toUpperCase();

  return {
    id: data.id,
    name: `${data.first_name} ${data.last_name}`.trim(),
    email: data.email,
    role: data.role as User["role"],
    active: data.active,
    initials,
  };
}

// Auth-only concern (Supabase user_metadata, not a public.users column) —
// kept separate from the User type above rather than widening it, since
// that type is shared well beyond auth-gating. Set on creation by
// POST /api/admin/users for an admin-assigned temp password; cleared by
// the user themselves via supabase.auth.updateUser() on
// src/app/password-aendern once they set their own password.
export async function getMustChangePassword(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  return authUser?.user_metadata?.must_change_password === true;
}
