"use client";

import type { ReactNode } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

// Same tab-bar look as Verwaltung (admin-view.tsx's adminTabTriggerClassName)
// — reused verbatim so the two top-tab bars in the app read as one system.
const visualizationTabTriggerClassName =
  "relative h-14 rounded-none px-0 py-0 text-sm font-medium text-stone shadow-none transition-colors hover:text-ink data-[state=active]:bg-transparent data-[state=active]:text-ink data-[state=active]:font-semibold data-[state=active]:shadow-none after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-transparent data-[state=active]:after:bg-clay";

// Thin client shell around server-rendered content: Radix Tabs needs
// client-side state to switch panels, but the panel content itself
// (budgetStatus/expenseOverview/advanceOverview) is built by the async
// Server Component in visualization-view.tsx and passed straight through
// as children — no data fetching happens in this file.
export function VisualizationTabs({
  budgetStatus,
  expenseOverview,
  advanceOverview,
}: {
  budgetStatus: ReactNode;
  expenseOverview: ReactNode;
  advanceOverview: ReactNode;
}) {
  // The active tab lives in the URL (?tab=...), not local state: the
  // expense filter bar (expense-filter-bar.tsx) navigates via
  // router.push on every filter change, which would otherwise reset an
  // uncontrolled Tabs component back to its defaultValue and silently
  // kick the user back to Budget-Status while they're filtering Belege.
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get("tab") ?? "budget";

  function handleTabChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "budget") params.delete("tab");
    else params.set("tab", value);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <Tabs value={currentTab} onValueChange={handleTabChange} className="w-full">
      <div className="sticky top-0 z-10 -mx-8 bg-shell px-8 pt-4">
        <div className="overflow-x-auto">
          <TabsList className="flex h-14 w-max min-w-full items-stretch justify-start gap-10 rounded-none border-b border-line bg-transparent p-0 text-stone">
            <TabsTrigger value="budget" className={visualizationTabTriggerClassName}>
              Budget-Status
            </TabsTrigger>
            <TabsTrigger value="expenses" className={visualizationTabTriggerClassName}>
              Belege-Übersicht
            </TabsTrigger>
            <TabsTrigger value="advances" className={visualizationTabTriggerClassName}>
              Vorschuss-Übersicht
            </TabsTrigger>
          </TabsList>
        </div>
      </div>

      <TabsContent value="budget" className="mt-8">
        {budgetStatus}
      </TabsContent>
      <TabsContent value="expenses" className="mt-8">
        {expenseOverview}
      </TabsContent>
      <TabsContent value="advances" className="mt-8">
        {advanceOverview}
      </TabsContent>
    </Tabs>
  );
}
