"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageContainer, PageHeader, StatusPill } from "@/components/layout/app-shell";
import { fmtEUR, statusLabel, statusTone } from "@/lib/mock-data";
import { callBackend, backendErrorMessage } from "@/lib/api";
import { uploadReceipt } from "@/lib/supabase/upload-receipt";
import { createClient } from "@/lib/supabase/client";
import type {
  AdvanceReconciliationDetail,
  AdvanceChildLine,
} from "@/lib/supabase/queries/advances";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, CheckCircle2, FileSpreadsheet, Upload as UploadIcon } from "lucide-react";
import { toast } from "sonner";

// The split-advance reconciliation flow's action screen
// (test-run/OPEN_DECISIONS.md item #2's replacement design). Three active
// states share this one page: submitted_unverified (upload the Excel),
// reconciliation_in_progress (attach a receipt + accounting fields per
// line), reconciliation_submitted (Accounting reviews and confirms).
// `reconciled` just points back to the classic Expense Detail page, which
// already renders the final reconciled lines (ReconciliationTable) — no
// need to duplicate that view here.
export function AdvanceDetailView({
  advance,
  isOwnAdvance,
  isAccounting,
}: {
  advance: AdvanceReconciliationDetail;
  isOwnAdvance: boolean;
  isAccounting: boolean;
}) {
  return (
    <PageContainer>
      <Link
        href="/advances"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors"
      >
        <ArrowLeft className="size-3.5" /> Zurück zu Vorschüsse
      </Link>

      <PageHeader
        eyebrow={`Vorschuss · ${advance.id.slice(0, 8)}`}
        title={advance.description}
        description={
          <>
            {advance.projectName ?? "—"} · {advance.partnerName ?? "—"} · {fmtEUR(advance.amount)}
          </>
        }
        actions={
          <StatusPill tone={statusTone(advance.status)}>{statusLabel(advance.status)}</StatusPill>
        }
      />

      {advance.status === "submitted_unverified" && isOwnAdvance && (
        <UploadExcelCard advance={advance} />
      )}
      {advance.status === "submitted_unverified" && !isOwnAdvance && (
        <p className="text-sm text-muted-foreground">
          Dieser Vorschuss wurde noch nicht aufgeteilt.
        </p>
      )}

      {advance.status === "reconciliation_in_progress" && (
        <SplitLinesSection advance={advance} canEdit={isOwnAdvance} />
      )}

      {advance.status === "reconciliation_submitted" && (
        <SplitLinesSection advance={advance} canEdit={false} showConfirm={isAccounting} />
      )}

      {advance.status === "reconciled" && (
        <div className="bg-card ring-1 ring-line card-shape p-6">
          <div className="flex items-center gap-2 text-sm text-success mb-2">
            <CheckCircle2 className="size-4" /> Dieser Vorschuss ist vollständig abgerechnet.
          </div>
          <Link href={`/expenses/${advance.id}`}>
            <Button variant="outline" size="sm">
              Details ansehen
            </Button>
          </Link>
        </div>
      )}
    </PageContainer>
  );
}

function UploadExcelCard({ advance }: { advance: AdvanceReconciliationDetail }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleUpload = async () => {
    if (!file) return;
    setSubmitting(true);
    try {
      const documentRef = await uploadReceipt(file, advance.projectCode ?? "unbekannt");
      await callBackend("advances.split", { expenseId: advance.id, documentRef });
      toast.success("Excel-Zusammenfassung übernommen", {
        description: "Der Vorschuss wurde in einzelne Positionen aufgeteilt.",
      });
      router.refresh();
    } catch (error) {
      toast.error("Aufteilung fehlgeschlagen", { description: backendErrorMessage(error) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-card ring-1 ring-line card-shape p-6">
      <h2 className="font-semibold text-sm">Excel-Zusammenfassung hochladen</h2>
      <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-lg">
        Die vom Partner gesendete Abrechnungs-Excel teilt diesen Vorschuss in einzelne Positionen
        auf. Kostenstelle, USt-Satz und Buchungsschlüssel sind darin nicht enthalten — diese ordnen
        Sie danach pro Position selbst zu, zusammen mit dem passenden Beleg.
      </p>

      <div className="mt-5 max-w-sm">
        <Label className="text-xs">Excel-Datei</Label>
        <label className="mt-1.5 flex items-center gap-3 border border-line card-shape px-3 py-2 cursor-pointer hover:bg-secondary/40 transition-colors">
          <FileSpreadsheet className="size-4 text-ember shrink-0" />
          <span className="text-sm truncate">{file ? file.name : "Datei auswählen"}</span>
          <input
            type="file"
            className="sr-only"
            accept=".xlsx,.xls"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>

      <Button onClick={handleUpload} disabled={!file || submitting} className="mt-5">
        <UploadIcon className="size-4" /> Hochladen und aufteilen
      </Button>
    </div>
  );
}

function SplitLinesSection({
  advance,
  canEdit,
  showConfirm = false,
}: {
  advance: AdvanceReconciliationDetail;
  canEdit: boolean;
  showConfirm?: boolean;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const allReady = advance.children.every(
    (c) => c.receiptStatus === "attached" && c.costCenterId && c.bookingKey,
  );

  const handleSubmitForReconciliation = async () => {
    setSubmitting(true);
    try {
      await callBackend("advances.submitForReconciliation", { expenseId: advance.id });
      toast.success("Zur Abrechnung eingereicht", {
        description: "Die Buchhaltung wurde informiert.",
      });
      router.refresh();
    } catch (error) {
      toast.error("Einreichung fehlgeschlagen", { description: backendErrorMessage(error) });
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await callBackend("expenses.reconcile", { expenseId: advance.id });
      toast.success("Vorschuss abgerechnet");
      router.refresh();
    } catch (error) {
      toast.error("Bestätigung fehlgeschlagen", { description: backendErrorMessage(error) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {advance.children.map((child) => (
        <ChildLineCard
          key={child.id}
          child={child}
          projectCode={advance.projectCode}
          groupCostCenters={advance.groupCostCenters}
          canEdit={canEdit}
        />
      ))}

      {canEdit && (
        <div className="flex items-center justify-between bg-card ring-1 ring-line card-shape p-5">
          <p className="text-xs text-muted-foreground max-w-md">
            {allReady
              ? "Alle Positionen sind belegt und zugeordnet."
              : "Jede Position benötigt einen Beleg, eine Kostenstelle und einen Buchungsschlüssel, bevor Sie einreichen können."}
          </p>
          <Button onClick={handleSubmitForReconciliation} disabled={!allReady || submitting}>
            Zur Abrechnung einreichen
          </Button>
        </div>
      )}

      {showConfirm && (
        <div className="flex items-center justify-between bg-card ring-1 ring-line card-shape p-5">
          <p className="text-xs text-muted-foreground max-w-md">
            Prüfen Sie bei Bedarf die einzelnen Belege oben, bevor Sie die Abrechnung endgültig
            bestätigen.
          </p>
          <Button onClick={handleConfirm} disabled={submitting}>
            Abrechnung bestätigen
          </Button>
        </div>
      )}
    </div>
  );
}

function ChildLineCard({
  child,
  projectCode,
  groupCostCenters,
  canEdit,
}: {
  child: AdvanceChildLine;
  projectCode: string | null;
  groupCostCenters: AdvanceReconciliationDetail["groupCostCenters"];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [costCenterId, setCostCenterId] = useState(
    child.costCenterId ?? groupCostCenters[0]?.id ?? "",
  );
  const [bookingKey, setBookingKey] = useState(child.bookingKey ?? "");
  const [vatRate, setVatRate] = useState<0 | 7 | 19>((child.vatRate as 0 | 7 | 19) ?? 19);
  // The Excel-parsed exchange rate is a partner-supplied figure, never
  // fetched/verified from an external source by design (migration 0017) —
  // a human correcting a wrong one here is the actual verification step.
  // Always a plain open field, not conditionally shown: the Excel carries
  // an amount and a rate for every line regardless of whether that rate
  // happens to be 1, and there's no currency label to gate this on
  // (the source document doesn't have one -- see the same migration).
  const [localAmount, setLocalAmount] = useState(child.localAmount ?? child.amount);
  const [exchangeRate, setExchangeRate] = useState(child.exchangeRate ?? 1);
  const correctedGross = Math.round((localAmount / (exchangeRate || 1)) * 100) / 100;
  const [netAmount, setNetAmount] = useState(
    child.netAmount ?? Math.round((child.amount / 1.19) * 100) / 100,
  );
  const [kskLiable, setKskLiable] = useState(!!child.kskLiable);
  const [submitting, setSubmitting] = useState(false);

  const isReady = child.receiptStatus === "attached";

  const handleSave = async () => {
    if (!bookingKey.trim()) {
      toast.error("Buchungsschlüssel fehlt");
      return;
    }
    if (!file && !child.documentRef) {
      toast.error("Beleg fehlt");
      return;
    }
    setSubmitting(true);
    try {
      const documentRef = file
        ? await uploadReceipt(file, projectCode ?? "unbekannt")
        : child.documentRef!;
      await callBackend("expenses.attachReceipt", {
        expenseId: child.id,
        documentRef,
        costCenterId,
        bookingKey: bookingKey.trim(),
        vatRate,
        netAmount,
        kskLiable,
        localAmount,
        exchangeRate,
      });
      toast.success("Beleg zugeordnet");
      router.refresh();
    } catch (error) {
      toast.error("Zuordnung fehlgeschlagen", { description: backendErrorMessage(error) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-card ring-1 ring-line card-shape p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-sm font-medium">{child.description}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {fmtEUR(canEdit ? correctedGross : child.amount)}
            {(canEdit ? localAmount : child.localAmount) != null && (
              <>
                {" "}
                (Betrag {(canEdit ? localAmount : child.localAmount)?.toLocaleString("de-DE")}, Kurs{" "}
                {canEdit ? exchangeRate : child.exchangeRate})
              </>
            )}
          </div>
        </div>
        {isReady ? (
          <div className="flex items-center gap-1.5 text-xs text-success">
            <CheckCircle2 className="size-4" /> Beleg vorhanden
          </div>
        ) : (
          <StatusPill tone="warning">Beleg fehlt</StatusPill>
        )}
      </div>

      {!canEdit ? (
        isReady && child.documentRef && <ViewReceiptLink documentRef={child.documentRef} />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Kostenstelle</Label>
              <Select value={costCenterId} onValueChange={setCostCenterId}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Kostenstelle wählen" />
                </SelectTrigger>
                <SelectContent>
                  {groupCostCenters.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.code} — {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Beleg</Label>
              <label className="mt-1.5 flex items-center gap-2 border border-line card-shape px-3 py-2 cursor-pointer hover:bg-secondary/40 transition-colors">
                <UploadIcon className="size-4 text-ember shrink-0" />
                <span className="text-sm truncate">
                  {file ? file.name : child.documentRef ? "Beleg ersetzen" : "Datei auswählen"}
                </span>
                <input
                  type="file"
                  className="sr-only"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 bg-secondary/30 card-shape p-4">
            <div>
              <Label className="text-xs">Betrag lt. Excel</Label>
              <Input
                className="mt-1.5 font-mono"
                type="number"
                step="0.01"
                value={localAmount || ""}
                onChange={(e) => setLocalAmount(parseFloat(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label className="text-xs">Wechselkurs</Label>
              <Input
                className="mt-1.5 font-mono"
                type="number"
                step="0.0001"
                value={exchangeRate || ""}
                onChange={(e) => setExchangeRate(parseFloat(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label className="text-xs">Ergibt (EUR)</Label>
              <Input className="mt-1.5 font-mono" value={fmtEUR(correctedGross)} disabled />
            </div>
            <p className="text-[11px] text-muted-foreground col-span-full">
              Aus der Excel-Datei übernommen — bitte prüfen und bei Bedarf korrigieren, bevor Sie
              speichern. Dieser Betrag bucht später auf das Budget.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <Label className="text-xs">USt-Satz</Label>
              <Select
                value={String(vatRate)}
                onValueChange={(v) => setVatRate(parseInt(v) as 0 | 7 | 19)}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="19">19 %</SelectItem>
                  <SelectItem value="7">7 %</SelectItem>
                  <SelectItem value="0">0 %</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Netto (EUR)</Label>
              <Input
                className="mt-1.5 font-mono"
                type="number"
                step="0.01"
                value={netAmount || ""}
                onChange={(e) => setNetAmount(parseFloat(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label className="text-xs">
                Buchungsschlüssel <span className="text-destructive">*</span>
              </Label>
              <Input
                className="mt-1.5 font-mono"
                value={bookingKey}
                onChange={(e) => setBookingKey(e.target.value)}
                placeholder="z. B. 8400"
              />
            </div>
            <label className="flex items-center gap-2 pb-2 self-end">
              <Checkbox checked={kskLiable} onCheckedChange={(v) => setKskLiable(v === true)} />
              <span className="text-sm">KSK-pflichtig</span>
            </label>
          </div>

          <Button size="sm" onClick={handleSave} disabled={submitting}>
            Position speichern
          </Button>
        </div>
      )}
    </div>
  );
}

// `receipts` is a private bucket (see BUG-012, test-run/findings/BUGS.md) --
// there is no plain public URL for a document_ref, only a short-lived
// signed one, generated on demand from the viewer's own RLS-scoped
// session. This is the one place in the app that actually implements the
// "clickable link to the receipt" the frontend's own CLAUDE.md calls for
// (DetailsCard's existing "Beleg" row still only shows a static label —
// a pre-existing gap, out of scope here, but not one to reproduce in new
// code that specifically needs this to work).
function ViewReceiptLink({ documentRef }: { documentRef: string }) {
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
      Beleg ansehen
    </button>
  );
}
