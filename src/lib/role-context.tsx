"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Role, User } from "./mock-data";

interface RoleContextValue {
  user: User;
  hasRole: (...r: Role[]) => boolean;
}

const RoleContext = createContext<RoleContextValue | null>(null);

// Seeded from the real signed-in user (see supabase/queries/current-user.ts),
// fetched server-side by app/(app)/layout.tsx — there is no client-side role
// switching anymore. Signing in as a different account is the only way to
// see the app as a different role now.
export function RoleProvider({ user, children }: { user: User; children: ReactNode }) {
  return (
    <RoleContext.Provider value={{ user, hasRole: (...r) => r.includes(user.role) }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useCurrentUser() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useCurrentUser must be used within RoleProvider");
  return ctx;
}
