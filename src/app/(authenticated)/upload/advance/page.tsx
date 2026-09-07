import type { Metadata } from "next";
import { AdvanceForm } from "./advance-form";
import { getUploadOptions } from "@/lib/supabase/queries/upload-options";

export const metadata: Metadata = {
  title: "Partner-Vorschuss anlegen — D4U Finance",
};

export default async function UploadAdvancePage() {
  const options = await getUploadOptions();
  return <AdvanceForm projects={options.projects} partners={options.partners} />;
}
