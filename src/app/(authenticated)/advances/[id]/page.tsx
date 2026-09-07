import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { getCurrentUserProfile } from "@/lib/supabase/queries/current-user";
import { getAdvanceReconciliationDetail } from "@/lib/supabase/queries/advances";
import { AdvanceDetailView } from "./advance-detail-view";

export const metadata: Metadata = {
  title: "Vorschuss abrechnen — D4U Finance",
};

export default async function AdvanceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUserProfile();
  if (!user) redirect("/login");

  const advance = await getAdvanceReconciliationDetail(id);
  if (!advance) notFound();

  return (
    <AdvanceDetailView
      advance={advance}
      isOwnAdvance={advance.submittedBy === user.id}
      isAccounting={user.role === "accounting"}
    />
  );
}
