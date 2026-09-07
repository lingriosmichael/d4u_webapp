"use client";

import type { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";

// RoleProvider + AppShell live in app/(authenticated)/layout.tsx because
// they require the server-fetched session.
export function Providers({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Toaster />
    </>
  );
}
