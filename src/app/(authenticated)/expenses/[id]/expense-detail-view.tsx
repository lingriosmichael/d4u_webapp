"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { PageContainer, PageHeader, StatusPill } from "@/components/layout/app-shell";
import { fmtEUR, fmtDate, fmtDateTime, statusLabel, statusTone } from "@/lib/mock-data";
import type { ExpenseDetail, ReconciledLine } from "@/lib/supabase/queries/expense-detail";
import type { UploadProject } from "@/lib/supabase/queries/upload-options";
import type { PermittedActions } from "@/lib/supabase/queries/permitted-actions";
import { callBackend, BackendError, backendErrorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertTriangle, ArrowLeft, CheckCircle2, Plus, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { parseGermanAmount } from "@/lib/parse-amount";

type Mode = "review" | "edit" | "reconcile" | "readonly";

// Converted from lib/mock-data.ts to the real Supabase read (server-fetched
// by page.tsx, passed as a prop) + real backend writes (via callBackend) —
// the last of the four main screens to make this switch. Every action
// below calls the actual d4u_backend route and reflects its real response;
// router.refresh() re-fetches this page's server data on success so the UI
// shows the backend's authoritative new state, not an optimistic guess.
//
// Action visibility is driven entirely by `permittedActions`, fetched
// server-side from GET /api/expenses/:id/permitted-actions (see that route
// and state-machine.ts's getPermittedActions) — never recomputed here from
// user.role + expense.status. This screen used to do exactly that
// client-side recomputation, which contradicted this repo's own
// non-negotiable "server-authorized UI, not client-hidden UI" rule (see
// test-run/INVENTORY.md §7 finding #1). The backend's guard middleware was
// always the real enforcement, but the button that showed or didn't show
// was drifting from it independently — this makes them the same source of
// truth.
export function ExpenseDetailView({
  expense,
  reassignProjects,
  permittedActions,
}: {
  expense: ExpenseDetail;
  reassignProjects: UploadProject[];
  permittedActions: PermittedActions;
}) {
  const mode: Mode = useMemo(() => {
    // documentsReceived is permitted exactly when the backend considers
    // this expense open for accounting to work on
    // (role=accounting, expense_type=partner_advance, status=
    // submitted_unverified — see handleDocumentsReceived) — the same
    // precondition this screen's reconciliation step needs, whether or not
    // documents have already been marked received.
    if (permittedActions.documentsReceived) return "reconcile";
    if (permittedActions.resubmit) return "edit";
    if (permittedActions.approve || permittedActions.reject) return "review";
    return "readonly";
  }, [permittedActions]);

  // Umwidmung is a separate two-step action, not tied to `mode` — it can be
  // proposed or approved regardless of whose turn it is to approve/reject.
  const canProposeReassign = permittedActions.reassignRequest;
  const canApproveReassign = permittedActions.reassignApprove;

  // No separate "rejected" log action exists in the real schema (verified
  // against the live approval_logs_action_check constraint) — only
  // requested_changes, which is what "Korrektur anfordern" always writes.
  const lastRejection = [...expense.logs].reverse().find((l) => l.action === "requested_changes");

  return (
    <PageContainer>
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors"
      >
        <ArrowLeft className="size-3.5" /> Zurück zur Übersicht
      </Link>

      <PageHeader
        eyebrow={`Beleg · ${expense.id.slice(0, 8)}`}
        title={expense.description}
        description={
          <>
            {expense.projectName} · {expense.groupName}
            {expense.costCenterCode && (
              <>
                {" "}
                · {expense.costCenterCode} {expense.costCenterName}
              </>
            )}
          </>
        }
        actions={
          <StatusPill tone={statusTone(expense.status)}>{statusLabel(expense.status)}</StatusPill>
        }
      />

      {mode === "edit" && lastRejection && (
        <div className="mb-8 bg-destructive/5 border border-destructive/20 card-shape p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="size-4 text-destructive mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-destructive">Korrektur angefordert</div>
              <p className="text-sm mt-1 text-foreground leading-relaxed">{lastRejection.note}</p>
              <p className="text-[10px] text-muted-foreground mt-2">
                {lastRejection.actorName ?? "—"} · {fmtDateTime(lastRejection.at)}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {mode === "edit" ? (
            <EditForm expense={expense} />
          ) : mode === "reconcile" ? (
            <>
              <DocumentsReceivedCard expense={expense} />
              <ReconcilePointerCard expense={expense} />
            </>
          ) : (
            <DetailsCard expense={expense} />
          )}

          {mode === "review" && (
            <ReviewActions expense={expense} permittedActions={permittedActions} />
          )}
          {permittedActions.undoApproval && <UndoApprovalCard expense={expense} />}
          {permittedActions.markPaid && <MarkPaidCard expense={expense} />}
          {canProposeReassign && <UmwidmungProposeCard expense={expense} />}
          {canApproveReassign && (
            <UmwidmungApproveCard expense={expense} projects={reassignProjects} />
          )}
        </div>

        <aside className="lg:col-span-1">
          <div className="bg-card ring-1 ring-line card-shape p-6 sticky top-8">
            <h2 className="font-semibold text-sm mb-4">Verlauf</h2>
            <Timeline expense={expense} />

            <div className="mt-6 pt-6 border-t border-line space-y-3 text-xs">
              <MetaRow label="Eingereicht von" value={expense.submitterName ?? "—"} />
              <MetaRow label="Datum" value={fmtDate(expense.createdAt)} />
              {expense.partnerName && <MetaRow label="Partner" value={expense.partnerName} />}
              {expense.vendor && <MetaRow label="Lieferant" value={expense.vendor} />}
              {expense.invoiceNumber && (
                <MetaRow
                  label="Rechnungsnr."
                  value={<span className="font-mono">{expense.invoiceNumber}</span>}
                />
              )}
              <MetaRow label="Beleg" value={receiptLabel(expense.receiptStatus)} />
            </div>
          </div>
        </aside>
      </div>
    </PageContainer>
  );
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className="text-foreground text-right min-w-0 truncate">{value}</dd>
    </div>
  );
}

function receiptLabel(s: ExpenseDetail["receiptStatus"]) {
  switch (s) {
    case "attached":
      return "Angehängt";
    case "missing":
      return "Fehlt noch";
    case "not_required":
      return "Nicht erforderlich";
  }
}

function DetailsCard({ expense }: { expense: ExpenseDetail }) {
  return (
    <section className="bg-card ring-1 ring-line card-shape p-6">
      <h2 className="font-semibold text-sm mb-5">Belegdaten</h2>
      <dl className="grid grid-cols-1 md:grid-cols-2 gap-y-5 gap-x-8">
        <Field
          label="Betrag"
          value={
            <span className="font-mono font-semibold text-base">{fmtEUR(expense.amount)}</span>
          }
        />
        <Field label="Projekt" value={expense.projectName} />
        <Field label="Kostenstellen-Gruppe" value={expense.groupName} />
        <Field
          label="Kostenstelle"
          value={
            expense.costCenterCode ? `${expense.costCenterCode} — ${expense.costCenterName}` : "—"
          }
        />
        {expense.vendor && <Field label="Lieferant" value={expense.vendor} />}
        {expense.invoiceNumber && (
          <Field
            label="Rechnungsnr."
            value={<span className="font-mono">{expense.invoiceNumber}</span>}
          />
        )}
        <div className="md:col-span-2">
          <Field label="Beschreibung" value={expense.description} />
        </div>
      </dl>

      {expense.reconciledLines.length > 0 && (
        <div className="mt-8 pt-6 border-t border-line">
          <h3 className="font-semibold text-sm mb-3">Abrechnungspositionen</h3>
          <ReconciliationTable lines={expense.reconciledLines} />
        </div>
      )}
    </section>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
        {label}
      </dt>
      <dd className="text-sm text-foreground">{value ?? "—"}</dd>
    </div>
  );
}

// Purely internal bookkeeping markers, not user-facing events — everything
// else in approval_logs (including reassignment_requested) is shown.
const HIDDEN_LOG_ACTIONS = new Set(["budget_incremented"]);

function Timeline({ expense }: { expense: ExpenseDetail }) {
  const visibleLogs = expense.logs.filter((l) => !HIDDEN_LOG_ACTIONS.has(l.action));
  return (
    <ol className="space-y-4 relative before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-px before:bg-border">
      {visibleLogs.map((log, i) => {
        const isLast = i === visibleLogs.length - 1;
        return (
          <li key={log.id} className="relative pl-6">
            <div
              className={cn(
                "absolute left-0 top-1 size-3.5 rounded-full border-2 bg-card",
                isLast ? "border-clay" : "border-border",
              )}
            />
            <div className="text-xs font-semibold text-foreground">{actionLabel(log.action)}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {log.actorName ?? "System"} · {fmtDateTime(log.at)}
            </div>
            {log.note && (
              <p className="text-xs text-muted-foreground mt-1.5 italic leading-relaxed">
                &ldquo;{log.note}&rdquo;
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// Matches the live approval_logs_action_check constraint exactly (verified
// 2026-09-03, see d4u_backend/documentation/OPEN_DECISIONS.md) — not
// mock-data.ts's ApprovalAction fixture, whose vocabulary ("approved",
// "rejected", "reconciled", "undo_approval", "reassigned") the real
// constraint rejects. No log action exists for an Umwidmung *request*
// (only its eventual execution) or for a generic "escalated" event — both
// gaps on the backend side, not something to paper over here.
function actionLabel(a: string): string {
  switch (a) {
    case "submitted":
      return "Eingereicht";
    case "finance_approved":
      return "Von der Finanzleitung freigegeben";
    case "ceo_approved":
      return "Von der Geschäftsführung freigegeben";
    case "accounting_approved":
      return "Von der Buchhaltung freigegeben";
    case "requested_changes":
      return "Korrektur angefordert";
    case "resubmitted":
      return "Erneut eingereicht";
    case "advance_reconciled":
      return "Abgerechnet";
    case "approval_reversed":
      return "Freigabe zurückgezogen";
    case "documents_received":
      return "Unterlagen eingegangen";
    case "marked_paid":
      return "Als bezahlt markiert";
    case "reassigned_budget_line":
      return "Umgewidmet";
    case "reminder_sent":
      return "Erinnerung gesendet";
    default:
      return a;
  }
}

// --- Review actions ---------------------------------------------------------

function ReviewActions({
  expense,
  permittedActions,
}: {
  expense: ExpenseDetail;
  permittedActions: PermittedActions;
}) {
  const router = useRouter();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleApprove = async () => {
    setSubmitting(true);
    try {
      await callBackend("expenses.approve", { expenseId: expense.id });
      toast.success("Beleg freigegeben", { description: `Der Beleg wurde weitergeleitet.` });
      router.refresh();
    } catch (error) {
      toast.error("Freigabe fehlgeschlagen", { description: backendErrorMessage(error) });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!note.trim()) return;
    setSubmitting(true);
    try {
      await callBackend("expenses.requestChanges", { expenseId: expense.id, note });
      toast.success("Korrektur angefordert", {
        description: "Die einreichende Person wurde informiert.",
      });
      setRejectOpen(false);
      setNote("");
      router.refresh();
    } catch (error) {
      toast.error("Konnte Korrektur nicht anfordern", { description: backendErrorMessage(error) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="bg-card ring-1 ring-line card-shape p-6">
      <h2 className="font-semibold text-sm mb-4">Ihre Entscheidung</h2>
      <div className="flex flex-wrap gap-3">
        {permittedActions.approve && (
          <Button onClick={handleApprove} disabled={submitting} className="min-w-32">
            <CheckCircle2 className="size-4" /> Freigeben
          </Button>
        )}
        {permittedActions.reject && (
          <Button
            variant="outline"
            onClick={() => setRejectOpen(true)}
            disabled={submitting}
            className="min-w-32"
          >
            Korrektur anfordern
          </Button>
        )}
      </div>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Korrektur anfordern</DialogTitle>
            <DialogDescription>
              Bitte geben Sie eine konkrete Begründung an. Die einreichende Person sieht diese
              direkt beim Öffnen des Belegs.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={4}
            placeholder="Was muss geändert werden?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleReject} disabled={!note.trim() || submitting}>
              Korrektur anfordern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

// --- Undo approval (Accounting and CEO, awaiting_payment) -------------------
// Widened 2026-09-05 (documentation/approval_routing.md §6) — was CEO-only.

function UndoApprovalCard({ expense }: { expense: ExpenseDetail }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleUndo = async () => {
    if (!reason.trim()) return;
    setSubmitting(true);
    try {
      await callBackend("expenses.undoApproval", { expenseId: expense.id, reason });
      toast.success("Freigabe zurückgezogen");
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error("Konnte Freigabe nicht zurückziehen", {
        description: backendErrorMessage(error),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="bg-card ring-1 ring-destructive/20 card-shape p-6">
      <div className="flex items-start gap-3 mb-4">
        <AlertTriangle className="size-4 text-destructive shrink-0 mt-0.5" />
        <div>
          <h2 className="font-semibold text-sm">Freigabe zurückziehen</h2>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-lg">
            Dieser Beleg wurde bereits zur Auszahlung freigegeben. Das Zurückziehen storniert eine
            bereits eingeplante Zahlung — bitte nur in Ausnahmefällen und mit klarer Begründung.
          </p>
        </div>
      </div>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        <Undo2 className="size-4" /> Freigabe zurückziehen
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Freigabe zurückziehen</DialogTitle>
            <DialogDescription>
              Diese Aktion storniert die Auszahlung für diesen Beleg. Bitte begründen Sie den
              Schritt.
            </DialogDescription>
          </DialogHeader>
          <Textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              disabled={!reason.trim() || submitting}
              onClick={handleUndo}
            >
              Endgültig zurückziehen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

// --- Mark as paid (Accounting, awaiting_payment, standard expenses) --------

function MarkPaidCard({ expense }: { expense: ExpenseDetail }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [bookingKey, setBookingKey] = useState("");
  const [vatRate, setVatRate] = useState<0 | 7 | 19>(19);
  const [netAmount, setNetAmount] = useState(() => netFromGross(expense.amount, 19));
  const [kskLiable, setKskLiable] = useState(false);
  const [supplierVatId, setSupplierVatId] = useState("");
  const [supplierAddress, setSupplierAddress] = useState("");
  const [supplierBankName, setSupplierBankName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleVatRateChange = (v: string) => {
    const rate = Number(v) as 0 | 7 | 19;
    setVatRate(rate);
    setNetAmount(netFromGross(expense.amount, rate));
  };

  const isValid = bookingKey.trim().length > 0 && !isNaN(netAmount);

  const handleSubmit = async () => {
    if (!isValid) return;
    setSubmitting(true);
    try {
      await callBackend("expenses.markPaid", {
        expenseId: expense.id,
        accountingDetails: {
          bookingKey: bookingKey.trim(),
          vatRate,
          netAmount,
          kskLiable,
          supplierVatId: supplierVatId.trim() || undefined,
          supplierAddress: supplierAddress.trim() || undefined,
          supplierBankName: supplierBankName.trim() || undefined,
        },
      });
      toast.success("Beleg als bezahlt markiert");
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error("Konnte nicht als bezahlt markiert werden", {
        description: backendErrorMessage(error),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="bg-card ring-1 ring-line card-shape p-6">
      <h2 className="font-semibold text-sm mb-1">Zahlung erfassen</h2>
      <p className="text-xs text-muted-foreground mb-4 max-w-lg">
        Erfassen Sie die Buchungsdetails, um diesen Beleg als bezahlt zu markieren.
      </p>
      <Button onClick={() => setOpen(true)}>
        <CheckCircle2 className="size-4" /> Als bezahlt markieren
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Zahlung erfassen</DialogTitle>
            <DialogDescription>
              Diese Angaben werden für die Buchhaltung übernommen. Der Beleg gilt danach als bezahlt
              und kann nicht mehr bearbeitet werden.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">
                  Buchungsschlüssel <span className="text-destructive">*</span>
                </Label>
                <Input
                  className="mt-1.5"
                  value={bookingKey}
                  onChange={(e) => setBookingKey(e.target.value)}
                  placeholder="z. B. 4400"
                />
              </div>
              <div>
                <Label className="text-xs">USt-Satz</Label>
                <Select value={String(vatRate)} onValueChange={handleVatRateChange}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0 %</SelectItem>
                    <SelectItem value="7">7 %</SelectItem>
                    <SelectItem value="19">19 %</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">Brutto</Label>
                <Input className="mt-1.5 font-mono" value={fmtEUR(expense.amount)} disabled />
              </div>
              <div>
                <Label className="text-xs">Netto</Label>
                <Input
                  className="mt-1.5 font-mono"
                  type="text"
                  inputMode="decimal"
                  value={String(netAmount).replace(".", ",")}
                  onChange={(e) => {
                    const v = parseGermanAmount(e.target.value);
                    setNetAmount(isNaN(v) ? 0 : v);
                  }}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="ksk-mark-paid"
                checked={kskLiable}
                onCheckedChange={(v) => setKskLiable(!!v)}
              />
              <Label htmlFor="ksk-mark-paid" className="text-xs font-normal">
                Künstlersozialkasse-pflichtig
              </Label>
            </div>
            <div className="pt-4 border-t border-line space-y-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Lieferantendaten (optional)
              </p>
              <div>
                <Label className="text-xs">USt-IdNr.</Label>
                <Input
                  className="mt-1.5"
                  value={supplierVatId}
                  onChange={(e) => setSupplierVatId(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Adresse</Label>
                <Input
                  className="mt-1.5"
                  value={supplierAddress}
                  onChange={(e) => setSupplierAddress(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs">Bank</Label>
                <Input
                  className="mt-1.5"
                  value={supplierBankName}
                  onChange={(e) => setSupplierBankName(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleSubmit} disabled={!isValid || submitting}>
              Als bezahlt markieren
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function netFromGross(gross: number, vatRate: number): number {
  return Math.round((gross / (1 + vatRate / 100)) * 100) / 100;
}

// --- Documents received (Accounting, open partner advances) ----------------

function DocumentsReceivedCard({ expense }: { expense: ExpenseDetail }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const alreadyReceived = expense.logs.some((l) => l.action === "documents_received");

  const handleClick = async () => {
    setSubmitting(true);
    try {
      await callBackend("expenses.documentsReceived", { expenseId: expense.id });
      toast.success("Unterlagen als eingegangen markiert");
      router.refresh();
    } catch (error) {
      toast.error("Konnte nicht markiert werden", { description: backendErrorMessage(error) });
    } finally {
      setSubmitting(false);
    }
  };

  if (alreadyReceived) {
    return (
      <div className="flex items-center gap-2 text-xs text-success bg-success/5 border border-success/20 card-shape px-4 py-3">
        <CheckCircle2 className="size-4 shrink-0" /> Unterlagen sind eingegangen.
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-4 bg-card ring-1 ring-line card-shape px-5 py-4">
      <p className="text-xs text-muted-foreground max-w-md">
        Sobald die Belege des Partners eingegangen sind, markieren Sie das hier — unabhängig von der
        Abrechnung unten.
      </p>
      <Button
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={submitting}
        className="shrink-0"
      >
        Unterlagen eingegangen
      </Button>
    </div>
  );
}

// The old hand-typed-line-items reconciliation form (ReconcileForm) lived
// here — replaced entirely (not kept as a fallback, per an explicit
// decision that partners always send a summary Excel) by the split-advance
// flow: uploading the Excel, attaching receipts per line, and the final
// Accounting confirm all happen in the dedicated "Vorschüsse" tab, not on
// this page. This card is just a pointer over to it.
function ReconcilePointerCard({ expense }: { expense: ExpenseDetail }) {
  return (
    <div className="bg-card ring-1 ring-line card-shape p-6">
      <h2 className="font-semibold text-sm">Vorschuss-Abrechnung ({fmtEUR(expense.amount)})</h2>
      <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-lg">
        Die Abrechnung dieses Vorschusses erfolgt im Tab „Vorschüsse&rdquo; — dort laden Sie die
        Excel-Zusammenfassung des Partners hoch, die diesen Vorschuss in einzelne Positionen
        aufteilt.
      </p>
      <Link href="/advances" className="inline-block mt-3">
        <Button variant="outline" size="sm">
          Zu „Vorschüsse&rdquo;
        </Button>
      </Link>
    </div>
  );
}

// --- Umwidmung (reassign): propose + approve, two separate steps -----------

function UmwidmungProposeCard({ expense }: { expense: ExpenseDetail }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const handleClick = async () => {
    setSubmitting(true);
    try {
      await callBackend("expenses.reassign", { expenseId: expense.id });
      toast.success("Umwidmung vorgeschlagen", {
        description:
          "Bitte informieren Sie die Buchhaltung direkt — offene Vorschläge werden aktuell noch nicht in einer eigenen Liste angezeigt.",
      });
      router.refresh();
    } catch (error) {
      toast.error("Konnte nicht vorgeschlagen werden", { description: backendErrorMessage(error) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="bg-card ring-1 ring-line card-shape p-6">
      <h2 className="font-semibold text-sm mb-1">Umwidmung vorschlagen</h2>
      <p className="text-xs text-muted-foreground mb-4 max-w-lg">
        Schlägt vor, diesen Beleg einem anderen Projekt oder einer anderen Kostenstellen-Gruppe
        zuzuordnen. Die Buchhaltung muss dies gesondert genehmigen, bevor sich an der Zuordnung
        tatsächlich etwas ändert.
      </p>
      <Button variant="outline" onClick={handleClick} disabled={submitting}>
        Umwidmung vorschlagen
      </Button>
    </section>
  );
}

function UmwidmungApproveCard({
  expense,
  projects,
}: {
  expense: ExpenseDetail;
  projects: UploadProject[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [costCenterId, setCostCenterId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const project = projects.find((p) => p.id === projectId);
  const groups = project?.groups ?? [];
  const group = groups.find((g) => g.id === groupId);
  const groupCostCenters = group?.costCenters ?? [];

  const isValid = projectId && groupId && costCenterId;

  const handleSubmit = async () => {
    if (!isValid || !group) return;
    setSubmitting(true);
    try {
      await callBackend("expenses.reassignApprove", {
        expenseId: expense.id,
        newProjectId: projectId,
        newBudgetLineId: group.budgetLineId,
        newCostCenterId: costCenterId,
      });
      toast.success("Umwidmung genehmigt", { description: "Der Beleg wurde neu zugeordnet." });
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error("Umwidmung fehlgeschlagen", { description: backendErrorMessage(error) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="bg-card ring-1 ring-line card-shape p-6">
      <h2 className="font-semibold text-sm mb-1">Umwidmung genehmigen</h2>
      <p className="text-xs text-muted-foreground mb-4 max-w-lg">
        Ordnet diesen Beleg einem neuen Projekt und einer neuen Kostenstellen-Gruppe zu. Nutzen Sie
        dies erst, nachdem eine Umwidmung vorgeschlagen wurde — es gibt aktuell keine automatische
        Warteliste offener Vorschläge.
      </p>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Umwidmung genehmigen
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Umwidmung genehmigen</DialogTitle>
            <DialogDescription>
              Wählen Sie die neue Zuordnung für diesen Beleg. Die Umwidmung wird sofort wirksam und
              verschiebt das Budget dauerhaft auf die neue Kostenstellen-Gruppe.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Neues Projekt</Label>
              <Select
                value={projectId}
                onValueChange={(v) => {
                  setProjectId(v);
                  setGroupId("");
                  setCostCenterId("");
                }}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Projekt auswählen" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.code} — {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Neue Kostenstellen-Gruppe</Label>
              <Select
                value={groupId}
                onValueChange={(v) => {
                  setGroupId(v);
                  setCostCenterId("");
                }}
                disabled={!projectId}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue
                    placeholder={projectId ? "Gruppe auswählen" : "Erst Projekt wählen"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Neue Kostenstelle</Label>
              <Select value={costCenterId} onValueChange={setCostCenterId} disabled={!groupId}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue
                    placeholder={groupId ? "Kostenstelle auswählen" : "Erst Gruppe wählen"}
                  />
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
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleSubmit} disabled={!isValid || submitting}>
              Umwidmung genehmigen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

// --- Edit & Resubmit --------------------------------------------------------

function EditForm({ expense }: { expense: ExpenseDetail }) {
  const router = useRouter();
  const [amount, setAmount] = useState(String(expense.amount).replace(".", ","));
  const [description, setDescription] = useState(expense.description);
  const [vendor, setVendor] = useState(expense.vendor ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState(expense.invoiceNumber ?? "");
  const [costCenterId, setCostCenterId] = useState(expense.costCenterId ?? "");
  const [submitting, setSubmitting] = useState(false);

  // Same bound StandardExpenseForm's upload form enforces before enabling
  // submit — without this, an invalid amount silently became `undefined`
  // (JSON.stringify drops it) and the backend kept the OLD amount with no
  // indication anything was dropped, exactly when a submitter is trying to
  // fix a rejected amount.
  const amountNum = parseGermanAmount(amount);
  const isValid = !isNaN(amountNum) && amountNum > 0 && description.trim().length > 0;

  const handleResubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    setSubmitting(true);
    try {
      await callBackend("expenses.resubmit", {
        expenseId: expense.id,
        amount: amountNum,
        description,
        vendorName: vendor || undefined,
        invoiceNumber: invoiceNumber || undefined,
        costCenterId: costCenterId || undefined,
      });
      toast.success("Beleg erneut eingereicht", {
        description: "Der Prüfungslauf beginnt von vorn.",
      });
      router.refresh();
    } catch (error) {
      toast.error("Konnte nicht erneut einreichen", { description: backendErrorMessage(error) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleResubmit} className="bg-card ring-1 ring-line card-shape p-6 space-y-5">
      <h2 className="font-semibold text-sm">Änderungen vornehmen</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <Label className="text-xs">Projekt</Label>
          <Input className="mt-1.5" value={expense.projectName ?? ""} disabled />
        </div>
        <div>
          <Label className="text-xs">Kostenstellen-Gruppe</Label>
          <Input className="mt-1.5" value={expense.groupName ?? ""} disabled />
        </div>
      </div>

      <div>
        <Label className="text-xs">Kostenstelle</Label>
        <Select value={costCenterId} onValueChange={setCostCenterId}>
          <SelectTrigger className="mt-1.5">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {expense.groupCostCenters.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.code} — {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <Label className="text-xs">Betrag (EUR)</Label>
          <Input
            className="mt-1.5 font-mono"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          {(isNaN(amountNum) || amountNum <= 0) && (
            <p className="text-[11px] text-destructive mt-1">
              Bitte geben Sie einen gültigen Betrag größer als 0 ein.
            </p>
          )}
        </div>
        <div>
          <Label className="text-xs">Rechnungsnummer</Label>
          <Input
            className="mt-1.5"
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
          />
        </div>
      </div>

      <div>
        <Label className="text-xs">Lieferant</Label>
        <Input className="mt-1.5" value={vendor} onChange={(e) => setVendor(e.target.value)} />
      </div>

      <div>
        <Label className="text-xs">Beschreibung</Label>
        <Textarea
          className="mt-1.5"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="pt-4 flex justify-end">
        <Button type="submit" disabled={!isValid || submitting}>
          Erneut einreichen
        </Button>
      </div>
    </form>
  );
}

function ReconciliationTable({ lines }: { lines: ReconciledLine[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <tr>
          <th className="text-left py-2">Kostenstelle</th>
          <th className="text-left py-2">Beschreibung</th>
          <th className="text-right py-2">Netto</th>
          <th className="text-right py-2">USt</th>
          <th className="text-right py-2">Brutto</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => (
          <tr key={l.id} className="border-t border-line">
            <td className="py-2">{l.costCenterCode ?? "—"}</td>
            <td className="py-2">{l.description}</td>
            <td className="py-2 text-right font-mono">{fmtEUR(l.netAmount)}</td>
            <td className="py-2 text-right font-mono">{l.vatRate}%</td>
            <td className="py-2 text-right font-mono">{fmtEUR(l.grossAmount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
