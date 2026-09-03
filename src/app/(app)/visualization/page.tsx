import type { Metadata } from "next";
import { Visualization } from "./visualization-view";

export const metadata: Metadata = {
  title: "Auswertung — D4U Finance",
  description: "Soll/Ist/Obligo je Projekt und Kostenstellen-Gruppe.",
};

export default async function VisualizationPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const { project } = await searchParams;
  return <Visualization projectId={project} />;
}
