"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { NotebookPen, Pencil } from "lucide-react";
import { toast } from "sonner";
import { callBackend, backendErrorMessage } from "@/lib/api";
import { ACCOUNTING_NOTE_MAX_LENGTH, isAllowedAccountingNote } from "@/lib/accounting-note";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

// The Buchhaltungsnotiz (d4u_backend migration 0037): what happened to this
// expense and its payment references, in Accounting's words. Everyone who
// can open the expense reads it; only a user the backend allows
// (permittedActions.editAccountingNote, Accounting) sees "Bearbeiten". Every
// save shows up in Verlauf, so earlier versions stay readable there.
export function AccountingNoteCard({
  expenseId,
  note,
  canEdit,
}: {
  expenseId: string;
  note: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note ?? "");
  const [saving, setSaving] = useState(false);

  const startEditing = () => {
    setDraft(note ?? "");
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await callBackend("expenses.accountingNote", { expenseId, note: draft });
      toast.success(draft.trim() ? "Buchhaltungsnotiz gespeichert" : "Buchhaltungsnotiz entfernt");
      setEditing(false);
      router.refresh();
    } catch (error) {
      toast.error("Buchhaltungsnotiz konnte nicht gespeichert werden", {
        description: backendErrorMessage(error),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="bg-card ring-1 ring-line card-shape p-6">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <NotebookPen className="size-4 text-muted-foreground" />
          <h2 className="font-semibold text-sm">Buchhaltungsnotiz</h2>
        </div>
        {canEdit && !editing && (
          <Button variant="ghost" size="sm" onClick={startEditing}>
            <Pencil className="size-3.5" /> Bearbeiten
          </Button>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          <Textarea
            rows={5}
            value={draft}
            maxLength={ACCOUNTING_NOTE_MAX_LENGTH}
            placeholder="Was ist mit diesem Beleg passiert? Zahlungsreferenzen, Schlussrechnung, Gutschrift …"
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {draft.trim().length} / {ACCOUNTING_NOTE_MAX_LENGTH} Zeichen
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
                Abbrechen
              </Button>
              <Button onClick={handleSave} disabled={saving || !isAllowedAccountingNote(draft)}>
                Speichern
              </Button>
            </div>
          </div>
        </div>
      ) : note ? (
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{note}</p>
      ) : (
        <p className="text-xs text-muted-foreground">Noch keine Notiz.</p>
      )}
    </section>
  );
}
