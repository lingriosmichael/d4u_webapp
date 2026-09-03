"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { PageContainer, PageHeader, StatusPill } from "@/components/app-shell";
import { useCurrentUser } from "@/lib/role-context";
import { fmtEUR, fmtDate, fmtDateTime, statusLabel, statusTone } from "@/lib/mock-data";
import type { ExpenseDetail, ReconciledLine } from "@/lib/supabase/queries/expense-detail";
import { callBackend, BackendError } from "@/lib/api";
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

type Mode = "review" | "edit" | "reconcile" | "readonly";

// Converted from lib/mock-data.ts to the real Supabase read (server-fetched
// by page.tsx, passed as a prop) + real backend writes (via callBackend) —
// the last of the four main screens to make this switch. Every action
// below calls the actual d4u_backend route and reflects its real response;
// router.refresh() re-fetches this page's server data on success so the UI
// shows the backend's authoritative new state, not an optimistic guess.
export function ExpenseDetailView({ expense }: { expense: ExpenseDetail }) {
  const { user } = useCurrentUser();

  const mode: Mode = useMemo(() => {
    if (user.role === "accounting" && expense.status === "submitted_unverified") return "reconcile";
    if (expense.submittedBy === user.id && expense.status === "needs_changes") return "edit";
    if (
      expense.assignedApprover === user.id &&
      ["finance_approval", "ceo_approval", "accounting_approval"].includes(expense.status)
    ) {
      return "review";
    }
    return "readonly";
  }, [user, expense]);

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
        <div className="mb-8 bg-destructive/5 border border-destructive/20 rounded-xl p-5">
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
            <ReconcileForm expense={expense} />
          ) : (
            <DetailsCard expense={expense} />
          )}

          {mode === "review" && <ReviewActions expense={expense} />}
          {mode === "readonly" && user.role === "ceo" && expense.status === "awaiting_payment" && (
            <UndoApprovalCard expense={expense} />
          )}
        </div>

        <aside className="lg:col-span-1">
          <div className="bg-card ring-1 ring-black/5 rounded-xl p-6 sticky top-8">
            <h2 className="font-heading font-semibold text-sm mb-4">Verlauf</h2>
            <Timeline expense={expense} />

            <div className="mt-6 pt-6 border-t border-black/5 space-y-3 text-xs">
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
    case "not_applicable":
      return "Nicht erforderlich";
  }
}

/** Surfaces a BackendError's message (already German, user-safe — see
 * d4u_backend/src/lib/errors.ts) or a generic fallback for anything else
 * (network failure, unexpected shape), per this app's rule against
 * exposing internals in user-facing copy. */
function backendErrorMessage(error: unknown): string {
  if (error instanceof BackendError) return error.message;
  return "Die Aktion konnte nicht ausgeführt werden. Bitte versuchen Sie es erneut.";
}

function DetailsCard({ expense }: { expense: ExpenseDetail }) {
  return (
    <section className="bg-card ring-1 ring-black/5 rounded-xl p-6">
      <h2 className="font-heading font-semibold text-sm mb-5">Belegdaten</h2>
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
        <div className="mt-8 pt-6 border-t border-black/5">
          <h3 className="font-heading font-semibold text-sm mb-3">Abrechnungspositionen</h3>
          <ReconciliationTable lines={expense.reconciledLines} />
        </div>
      )}
    </section>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-heading font-semibold uppercase tracking-wider text-muted-foreground mb-1">
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
                isLast ? "border-navy-600" : "border-border",
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

function ReviewActions({ expense }: { expense: ExpenseDetail }) {
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
    <section className="bg-card ring-1 ring-black/5 rounded-xl p-6">
      <h2 className="font-heading font-semibold text-sm mb-4">Ihre Entscheidung</h2>
      <div className="flex flex-wrap gap-3">
        <Button onClick={handleApprove} disabled={submitting} className="min-w-32">
          <CheckCircle2 className="size-4" /> Freigeben
        </Button>
        <Button
          variant="outline"
          onClick={() => setRejectOpen(true)}
          disabled={submitting}
          className="min-w-32"
        >
          Korrektur anfordern
        </Button>
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

// --- Undo approval (CEO only, awaiting_payment) -----------------------------

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
    <section className="bg-card ring-1 ring-destructive/20 rounded-xl p-6">
      <div className="flex items-start gap-3 mb-4">
        <AlertTriangle className="size-4 text-destructive shrink-0 mt-0.5" />
        <div>
          <h2 className="font-heading font-semibold text-sm">Freigabe zurückziehen</h2>
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

// --- Edit & Resubmit --------------------------------------------------------

function EditForm({ expense }: { expense: ExpenseDetail }) {
  const router = useRouter();
  const [amount, setAmount] = useState(String(expense.amount).replace(".", ","));
  const [description, setDescription] = useState(expense.description);
  const [vendor, setVendor] = useState(expense.vendor ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState(expense.invoiceNumber ?? "");
  const [costCenterId, setCostCenterId] = useState(expense.costCenterId ?? "");
  const [submitting, setSubmitting] = useState(false);

  const handleResubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(amount.replace(",", "."));
    setSubmitting(true);
    try {
      await callBackend("expenses.resubmit", {
        expenseId: expense.id,
        amount: isNaN(amountNum) ? undefined : amountNum,
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
    <form
      onSubmit={handleResubmit}
      className="bg-card ring-1 ring-black/5 rounded-xl p-6 space-y-5"
    >
      <h2 className="font-heading font-semibold text-sm">Änderungen vornehmen</h2>

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
        <Button type="submit" disabled={submitting}>
          Erneut einreichen
        </Button>
      </div>
    </form>
  );
}

// --- Reconciliation (accounting) --------------------------------------------

interface DraftLine {
  id: string;
  costCenterId: string;
  description: string;
  gross: number;
  vatRate: 0 | 7 | 19;
  net: number;
  ksk: boolean;
  bookingKey?: string;
  supplier?: string;
}

function ReconcileForm({ expense }: { expense: ExpenseDetail }) {
  const router = useRouter();
  const groupCostCenters = expense.groupCostCenters;
  const [lines, setLines] = useState<DraftLine[]>([
    {
      id: crypto.randomUUID(),
      costCenterId: groupCostCenters[0]?.id ?? "",
      description: "",
      gross: 0,
      vatRate: 19,
      net: 0,
      ksk: false,
    },
  ]);
  const [submitting, setSubmitting] = useState(false);

  const updateLine = (id: string, patch: Partial<DraftLine>) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const merged = { ...l, ...patch };
        if (patch.gross !== undefined || patch.vatRate !== undefined) {
          const net = merged.gross / (1 + merged.vatRate / 100);
          merged.net = Math.round(net * 100) / 100;
        }
        return merged;
      }),
    );
  };

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        costCenterId: groupCostCenters[0]?.id ?? "",
        description: "",
        gross: 0,
        vatRate: 19,
        net: 0,
        ksk: false,
      },
    ]);
  };

  const removeLine = (id: string) => {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.id !== id) : prev));
  };

  const total = lines.reduce((s, l) => s + l.gross, 0);
  const diff = expense.amount - total;
  const overBudget = diff < 0;

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await callBackend("expenses.reconcile", {
        expenseId: expense.id,
        lineItems: lines.map((l) => ({
          costCenterId: l.costCenterId,
          description: l.description,
          grossAmount: l.gross,
          vatRate: l.vatRate,
          netAmount: l.net,
          kskLiable: l.ksk,
          bookingKey: l.bookingKey || undefined,
          supplier: l.supplier || undefined,
        })),
      });
      toast.success("Vorschuss abgerechnet", {
        description: `${lines.length} Positionen wurden verbucht.`,
      });
      router.refresh();
    } catch (error) {
      toast.error("Abrechnung fehlgeschlagen", { description: backendErrorMessage(error) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="bg-card ring-1 ring-black/5 rounded-xl overflow-hidden">
      <div className="p-6 border-b border-black/5">
        <h2 className="font-heading font-semibold text-sm">Vorschuss-Abrechnung</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Erfassen Sie eine Position pro Beleg. Netto wird automatisch aus Brutto und USt-Satz
          berechnet und kann bei Bedarf überschrieben werden.
        </p>
      </div>

      <div className="grid grid-cols-3 divide-x divide-black/5 text-sm bg-secondary/40">
        <SummaryCell label="Ursprünglicher Vorschuss" value={fmtEUR(expense.amount)} />
        <SummaryCell label="Bisher erfasst" value={fmtEUR(total)} />
        <SummaryCell
          label={overBudget ? "Überschreitung" : "Verbleibend (fließt zurück ins Budget)"}
          value={fmtEUR(Math.abs(diff))}
          tone={overBudget ? "danger" : diff > 0 ? "muted" : "success"}
        />
      </div>

      <div className="p-6 space-y-4">
        {lines.map((line, idx) => (
          <ReconciliationLineCard
            key={line.id}
            line={line}
            index={idx}
            groupCostCenters={groupCostCenters}
            onChange={(patch) => updateLine(line.id, patch)}
            onRemove={() => removeLine(line.id)}
            canRemove={lines.length > 1}
          />
        ))}

        <Button type="button" variant="outline" onClick={addLine} className="w-full">
          <Plus className="size-4" /> Position hinzufügen
        </Button>
      </div>

      <div className="p-6 border-t border-black/5 bg-secondary/30 flex items-center justify-between">
        <p className="text-xs text-muted-foreground max-w-md">
          {diff > 0 && !overBudget && (
            <>
              Der nicht abgerechnete Betrag ({fmtEUR(diff)}) fließt automatisch in das verfügbare
              Budget zurück.
            </>
          )}
          {overBudget && (
            <span className="text-destructive">
              Der abgerechnete Betrag übersteigt den Vorschuss um {fmtEUR(-diff)}.
            </span>
          )}
          {diff === 0 && <>Betrag vollständig abgerechnet.</>}
        </p>
        <Button onClick={handleSubmit} disabled={overBudget || submitting}>
          Abrechnung bestätigen
        </Button>
      </div>
    </section>
  );
}

function SummaryCell({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "danger" | "muted";
}) {
  return (
    <div className="p-5">
      <div className="text-[10px] font-heading font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-1 font-mono font-semibold text-base",
          tone === "danger" && "text-destructive",
          tone === "success" && "text-success",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function ReconciliationLineCard({
  line,
  index,
  groupCostCenters,
  onChange,
  onRemove,
  canRemove,
}: {
  line: DraftLine;
  index: number;
  groupCostCenters: ExpenseDetail["groupCostCenters"];
  onChange: (patch: Partial<DraftLine>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <div className="border border-border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-heading font-semibold uppercase tracking-wider text-muted-foreground">
          Position {index + 1}
        </div>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-muted-foreground hover:text-destructive transition-colors inline-flex items-center gap-1"
          >
            <Trash2 className="size-3" /> Entfernen
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label className="text-xs">Kostenstelle</Label>
          <Select value={line.costCenterId} onValueChange={(v) => onChange({ costCenterId: v })}>
            <SelectTrigger className="mt-1.5">
              <SelectValue />
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
          <Label className="text-xs">Beschreibung</Label>
          <Input
            className="mt-1.5"
            value={line.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="z. B. Materialkauf"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <Label className="text-xs">Brutto (EUR)</Label>
          <Input
            className="mt-1.5 font-mono"
            type="number"
            step="0.01"
            value={line.gross || ""}
            onChange={(e) => onChange({ gross: parseFloat(e.target.value) || 0 })}
          />
        </div>
        <div>
          <Label className="text-xs">USt-Satz</Label>
          <Select
            value={String(line.vatRate)}
            onValueChange={(v) => onChange({ vatRate: parseInt(v) as 0 | 7 | 19 })}
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
            value={line.net || ""}
            onChange={(e) => onChange({ net: parseFloat(e.target.value) || 0 })}
          />
        </div>
        <div>
          <Label className="text-xs">Buchungsschlüssel</Label>
          <Input
            className="mt-1.5 font-mono"
            value={line.bookingKey ?? ""}
            onChange={(e) => onChange({ bookingKey: e.target.value })}
            placeholder="z. B. 8400"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
        <div>
          <Label className="text-xs">Lieferant (optional)</Label>
          <Input
            className="mt-1.5"
            value={line.supplier ?? ""}
            onChange={(e) => onChange({ supplier: e.target.value })}
          />
        </div>
        <label className="flex items-center gap-2 pb-2 pl-1">
          <Checkbox
            checked={line.ksk}
            onCheckedChange={(v) => onChange({ ksk: v === true })}
            id={`ksk-${line.id}`}
          />
          <span className="text-sm">KSK-pflichtig</span>
        </label>
      </div>
    </div>
  );
}

function ReconciliationTable({ lines }: { lines: ReconciledLine[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="text-[10px] font-heading font-semibold uppercase tracking-wider text-muted-foreground">
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
          <tr key={l.id} className="border-t border-black/5">
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
