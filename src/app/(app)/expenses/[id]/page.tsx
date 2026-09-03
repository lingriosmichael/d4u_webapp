import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getExpense } from "@/lib/mock-data";
import { ExpenseDetailView } from "./expense-detail-view";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return { title: `${id} — D4U Finance`, robots: { index: false, follow: false } };
}

export default async function ExpenseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getExpense(id)) notFound();

  return <ExpenseDetailView expenseId={id} />;
}
