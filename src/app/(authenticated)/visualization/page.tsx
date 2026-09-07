import type { Metadata } from "next";
import { Visualization } from "./visualization-view";

export const metadata: Metadata = {
  title: "Auswertung — D4U Finance",
  description: "Soll/Ist/Obligo je Projekt und Kostenstellen-Gruppe.",
};

export default async function VisualizationPage({
  searchParams,
}: {
  searchParams: Promise<{
    project?: string;
    status?: string;
    responsible?: string;
    costCenter?: string;
    expenseProject?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const params = await searchParams;
  return (
    <Visualization
      projectId={params.project}
      expenseFilters={{
        status: params.status,
        responsible: params.responsible,
        costCenter: params.costCenter,
        expenseProject: params.expenseProject,
        from: params.from,
        to: params.to,
      }}
    />
  );
}
