import type { Metadata } from "next";
import { DashboardView } from "./dashboard-view";

export const metadata: Metadata = {
  title: "Übersicht — D4U Finance",
  description: "Ihre offenen Aufgaben und Projektbudgets im Überblick.",
};

export default function DashboardPage() {
  return <DashboardView />;
}
