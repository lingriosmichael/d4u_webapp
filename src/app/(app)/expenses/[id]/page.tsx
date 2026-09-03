import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getExpenseDetail } from "@/lib/supabase/queries/expense-detail";
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
  const expense = await getExpenseDetail(id);
  if (!expense) notFound();

  return <ExpenseDetailView expense={expense} />;
}
