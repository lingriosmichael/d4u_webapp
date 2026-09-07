import type { Metadata } from "next";
import { StandardExpenseForm } from "./expense-form";
import { getUploadOptions } from "@/lib/supabase/queries/upload-options";

export const metadata: Metadata = {
  title: "Standardbeleg einreichen — D4U Finance",
};

export default async function UploadExpensePage() {
  const options = await getUploadOptions();
  return <StandardExpenseForm projects={options.projects} />;
}
