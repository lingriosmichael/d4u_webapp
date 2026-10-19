"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileWarning } from "lucide-react";
import { toast } from "sonner";
import { callBackend, backendErrorMessage } from "@/lib/api";
import { uploadReceipt } from "@/lib/supabase/upload-receipt";
import type { ExpenseDetail } from "@/lib/supabase/queries/expense-detail";
import { ReceiptFileInput } from "@/components/receipt-file-input";
import { Button } from "@/components/ui/button";

// "Beleg nachreichen" (D4U, 19 Oct 2026; d4u_backend add-receipt): a
// standard expense submitted without its invoice gets it here, in any
// status, by the submitter or Accounting. Shown only when the backend
// permits addReceipt, i.e. while the receipt is missing. Nothing but the
// receipt changes; Verlauf records it as "Beleg nachgereicht".
export function AddReceiptCard({ expense }: { expense: ExpenseDetail }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!file) return;
    setSubmitting(true);
    try {
      const documentRef = await uploadReceipt(file, expense.projectCode ?? "unbekannt");
      await callBackend("expenses.addReceipt", { expenseId: expense.id, documentRef });
      toast.success("Beleg nachgereicht");
      setFile(null);
      router.refresh();
    } catch (error) {
      toast.error("Beleg konnte nicht nachgereicht werden", {
        description: backendErrorMessage(error),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="bg-card ring-1 ring-line card-shape p-6 space-y-4">
      <div className="flex items-start gap-3">
        <FileWarning className="size-4 shrink-0 text-destructive mt-0.5" />
        <div>
          <h2 className="font-semibold text-sm">Beleg fehlt</h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-md">
            Zu dieser Ausgabe ist noch keine Rechnung hinterlegt. Sobald sie vorliegt, laden Sie sie
            hier hoch.
          </p>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1">
          <ReceiptFileInput file={file} onChange={setFile} disabled={submitting} />
        </div>
        <Button onClick={handleSubmit} disabled={!file || submitting} className="shrink-0">
          Beleg nachreichen
        </Button>
      </div>
    </section>
  );
}
