"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PageContainer, PageHeader, StatusPill } from "@/components/app-shell";
import { useCurrentUser } from "@/lib/role-context";
import {
  getExpense,
  getProject,
  getUser,
  getPartner,
  getCostCenter,
  getGroup,
  fmtEUR,
  fmtDate,
  fmtDateTime,
  statusLabel,
  statusTone,
  groupsForProject,
  type Expense,
  type ReconciliationLine,
} from "@/lib/mock-data";
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

export function ExpenseDetailView({ expenseId }: { expenseId: string }) {
  const expense = getExpense(expenseId)!;
  const { user } = useCurrentUser();

  const mode: Mode = useMemo(() => {
    // Reconciliation
    if (user.role === "accounting" && expense.status === "submitted_unverified") return "reconcile";
    // Edit & Resubmit
    if (expense.submittedByUserId === user.id && expense.status === "needs_changes") return "edit";
    // Review — assigned approver, in an approval-chain status
    if (
      expense.assignedApproverUserId === user.id &&
      ["finance_approval", "ceo_approval", "accounting_approval"].includes(expense.status)
    ) {
      return "review";
    }
    return "readonly";
  }, [user, expense]);

  const project = getProject(expense.projectId);
  const group = getGroup(expense.groupId);
  const costCenter = getCostCenter(expense.costCenterId);
  const submitter = getUser(expense.submittedByUserId);
  const partner = getPartner(expense.partnerId);

  const lastRejection = [...expense.logs]
    .reverse()
    .find((l) => l.action === "requested_changes" || l.action === "rejected");

  return (
    <PageContainer>
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors"
      >
        <ArrowLeft className="size-3.5" /> Zurück zur Übersicht
      </Link>

      <PageHeader
        eyebrow={`Beleg · ${expense.id}`}
        title={expense.description}
        description={
          <>
            {project?.name} · {group?.name}
            {costCenter && (
              <>
                {" "}
                · {costCenter.code} {costCenter.name}
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
                {getUser(lastRejection.actorUserId)?.name} · {fmtDateTime(lastRejection.at)}
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
              <MetaRow label="Eingereicht von" value={submitter?.name ?? "—"} />
              <MetaRow label="Datum" value={fmtDate(expense.createdAt)} />
              {partner && <MetaRow label="Partner" value={partner.name} />}
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

function receiptLabel(s: Expense["receiptStatus"]) {
  switch (s) {
    case "attached":
      return "Angehängt";
    case "missing":
      return "Fehlt noch";
    case "not_applicable":
      return "Nicht erforderlich";
  }
}

function DetailsCard({ expense }: { expense: Expense }) {
  const project = getProject(expense.projectId);
  const group = getGroup(expense.groupId);
  const costCenter = getCostCenter(expense.costCenterId);

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
        <Field label="Projekt" value={project?.name} />
        <Field label="Kostenstellen-Gruppe" value={group?.name} />
        <Field
          label="Kostenstelle"
          value={costCenter ? `${costCenter.code} — ${costCenter.name}` : "—"}
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

      {expense.reconciliationLines && expense.reconciliationLines.length > 0 && (
        <div className="mt-8 pt-6 border-t border-black/5">
          <h3 className="font-heading font-semibold text-sm mb-3">Abrechnungspositionen</h3>
          <ReconciliationTable lines={expense.reconciliationLines} readOnly />
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

function Timeline({ expense }: { expense: Expense }) {
  return (
    <ol className="space-y-4 relative before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-px before:bg-border">
      {expense.logs.map((log, i) => {
        const actor = getUser(log.actorUserId);
        const isLast = i === expense.logs.length - 1;
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
              {actor?.name ?? "System"} · {fmtDateTime(log.at)}
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

function actionLabel(a: Expense["logs"][number]["action"]) {
  switch (a) {
    case "submitted":
      return "Eingereicht";
    case "approved":
      return "Freigegeben";
    case "rejected":
      return "Abgelehnt";
    case "requested_changes":
      return "Korrektur angefordert";
    case "resubmitted":
      return "Erneut eingereicht";
    case "reconciled":
      return "Abgerechnet";
    case "undo_approval":
      return "Freigabe zurückgezogen";
    case "documents_received":
      return "Unterlagen eingegangen";
    case "marked_paid":
      return "Als bezahlt markiert";
    case "reassigned":
      return "Umgewidmet";
    case "escalated_ceo":
      return "An Geschäftsführung eskaliert";
  }
}

// --- Review actions ---------------------------------------------------------

function ReviewActions({ expense }: { expense: Expense }) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [note, setNote] = useState("");

  const handleApprove = () => {
    toast.success("Beleg freigegeben", { description: `${expense.id} wurde weitergeleitet.` });
  };

  const handleReject = () => {
    if (!note.trim()) return;
    toast.success("Korrektur angefordert", {
      description: "Die einreichende Person wurde informiert.",
    });
    setRejectOpen(false);
    setNote("");
  };

  return (
    <section className="bg-card ring-1 ring-black/5 rounded-xl p-6">
      <h2 className="font-heading font-semibold text-sm mb-4">Ihre Entscheidung</h2>
      <div className="flex flex-wrap gap-3">
        <Button onClick={handleApprove} className="min-w-32">
          <CheckCircle2 className="size-4" /> Freigeben
        </Button>
        <Button variant="outline" onClick={() => setRejectOpen(true)} className="min-w-32">
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
            <Button onClick={handleReject} disabled={!note.trim()}>
              Korrektur anfordern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

// --- Undo approval (CEO only, awaiting_payment) -----------------------------

function UndoApprovalCard({ expense }: { expense: Expense }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

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
              Diese Aktion storniert die Auszahlung für {expense.id}. Bitte begründen Sie den
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
              disabled={!reason.trim()}
              onClick={() => {
                toast.success("Freigabe zurückgezogen");
                setOpen(false);
              }}
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

function EditForm({ expense }: { expense: Expense }) {
  const [amount, setAmount] = useState(String(expense.amount).replace(".", ","));
  const [description, setDescription] = useState(expense.description);
  const [vendor, setVendor] = useState(expense.vendor ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState(expense.invoiceNumber ?? "");
  const [projectId, setProjectId] = useState(expense.projectId);
  const [groupId, setGroupId] = useState(expense.groupId);
  const [costCenterId, setCostCenterId] = useState(expense.costCenterId ?? "");

  const groups = groupsForProject(projectId);
  const group = groups.find((g) => g.id === groupId);
  const groupCostCenters = group
    ? group.costCenterIds.map((id) => getCostCenter(id)).filter(Boolean)
    : [];

  const handleResubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Beleg erneut eingereicht", {
      description: "Der Prüfungslauf beginnt von vorn.",
    });
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
          <Select
            value={projectId}
            onValueChange={(v) => {
              setProjectId(v);
              setGroupId("");
              setCostCenterId("");
            }}
          >
            <SelectTrigger className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from(new Set([expense.projectId])).map((pid) => {
                const p = getProject(pid);
                return p ? (
                  <SelectItem key={p.id} value={p.id}>
                    {p.code} — {p.name}
                  </SelectItem>
                ) : null;
              })}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Kostenstellen-Gruppe</Label>
          <Select
            value={groupId}
            onValueChange={(v) => {
              setGroupId(v);
              setCostCenterId("");
            }}
          >
            <SelectTrigger className="mt-1.5">
              <SelectValue />
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
      </div>

      <div>
        <Label className="text-xs">Kostenstelle</Label>
        <Select value={costCenterId} onValueChange={setCostCenterId}>
          <SelectTrigger className="mt-1.5">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {groupCostCenters.map((c) => (
              <SelectItem key={c!.id} value={c!.id}>
                {c!.code} — {c!.name}
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
        <Button type="submit">Erneut einreichen</Button>
      </div>
    </form>
  );
}

// --- Reconciliation (accounting) --------------------------------------------

function ReconcileForm({ expense }: { expense: Expense }) {
  const group = getGroup(expense.groupId)!;
  const groupCcIds = group.costCenterIds;
  const [lines, setLines] = useState<ReconciliationLine[]>([
    {
      id: crypto.randomUUID(),
      costCenterId: groupCcIds[0] ?? "",
      description: "",
      gross: 0,
      vatRate: 19,
      net: 0,
      ksk: false,
    },
  ]);

  const updateLine = (id: string, patch: Partial<ReconciliationLine>) => {
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
        costCenterId: groupCcIds[0] ?? "",
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

  const handleSubmit = () => {
    toast.success("Vorschuss abgerechnet", {
      description: `${lines.length} Positionen wurden verbucht.`,
    });
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
            groupCostCenterIds={groupCcIds}
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
        <Button onClick={handleSubmit} disabled={overBudget}>
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
  groupCostCenterIds,
  onChange,
  onRemove,
  canRemove,
}: {
  line: ReconciliationLine;
  index: number;
  groupCostCenterIds: string[];
  onChange: (patch: Partial<ReconciliationLine>) => void;
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
              {groupCostCenterIds.map((id) => {
                const c = getCostCenter(id);
                return c ? (
                  <SelectItem key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </SelectItem>
                ) : null;
              })}
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

function ReconciliationTable({
  lines,
  readOnly,
}: {
  lines: ReconciliationLine[];
  readOnly?: boolean;
}) {
  void readOnly;
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
        {lines.map((l) => {
          const cc = getCostCenter(l.costCenterId);
          return (
            <tr key={l.id} className="border-t border-black/5">
              <td className="py-2">{cc?.code ?? "—"}</td>
              <td className="py-2">{l.description}</td>
              <td className="py-2 text-right font-mono">{fmtEUR(l.net)}</td>
              <td className="py-2 text-right font-mono">{l.vatRate}%</td>
              <td className="py-2 text-right font-mono">{fmtEUR(l.gross)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
