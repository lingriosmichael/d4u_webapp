"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

// Opens a receipt from the private `receipts` bucket (see BUG-012, QA
// findings). There's no plain public URL for a document_ref, only a
// short-lived signed one, generated on demand from the viewer's own
// RLS-scoped session, so someone who may not read the file gets an error
// rather than the file. Used on Expense Detail (the original receipt and
// each correction's document) and in the Vorschuss line items.
export function ReceiptLink({
  documentRef,
  label = "Beleg ansehen",
}: {
  documentRef: string;
  label?: string;
}) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.storage
        .from("receipts")
        .createSignedUrl(documentRef, 60);
      if (error || !data) throw error ?? new Error("no signed url");
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Beleg konnte nicht geöffnet werden");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="text-xs text-ember hover:underline"
    >
      {label}
    </button>
  );
}
