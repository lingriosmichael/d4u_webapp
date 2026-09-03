import type { Metadata } from "next";
import { AdvanceForm } from "./advance-form";

export const metadata: Metadata = {
  title: "Partner-Vorschuss anlegen — D4U Finance",
};

export default function UploadAdvancePage() {
  return <AdvanceForm />;
}
