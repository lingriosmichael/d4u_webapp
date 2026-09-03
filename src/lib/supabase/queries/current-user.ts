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
