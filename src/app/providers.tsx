"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { RoleProvider } from "@/lib/role-context";
import { AppShell } from "@/components/app-shell";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <RoleProvider>
        <AppShell>{children}</AppShell>
        <Toaster />
      </RoleProvider>
    </QueryClientProvider>
  );
}
