import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getExpenseDetail } from "@/lib/supabase/queries/expense-detail";
import { getUploadOptions } from "@/lib/supabase/queries/upload-options";
import { getPermittedActions } from "@/lib/supabase/queries/permitted-actions";
import { ExpenseDetailView } from "./expense-detail-view";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Beleg ${id.slice(0, 8)} — D4U Finance`,
    robots: { index: false, follow: false },
  };
}

export default async function ExpenseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [expense, { projects: reassignProjects }, permittedActions] = await Promise.all([
    getExpenseDetail(id),
    getUploadOptions(),
    getPermittedActions(id),
  ]);
  if (!expense) notFound();

  return (
    <ExpenseDetailView
      expense={expense}
      reassignProjects={reassignProjects}
      permittedActions={permittedActions}
    />
  );
}
