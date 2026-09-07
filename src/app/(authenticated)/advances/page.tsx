import type { Metadata } from "next";
import { AdvancesView } from "./advances-view";

export const metadata: Metadata = {
  title: "Vorschüsse — D4U Finance",
  description: "Ihre offenen Partner-Vorschüsse und deren Abrechnung.",
};

export default function AdvancesPage() {
  return <AdvancesView />;
}
