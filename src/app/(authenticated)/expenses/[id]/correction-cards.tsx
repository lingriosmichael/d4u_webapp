"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, FilePen, Upload as UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { fmtEUR, fmtDateTime } from "@/lib/mock-data";
import { callBackend, backendErrorMessage } from "@/lib/api";
import { uploadReceipt } from "@/lib/supabase/upload-receipt";
import { correctionPreview } from "@/lib/expense-correction";
import { formatInvoiceDate, isAllowedInvoiceDate, todayInBerlin } from "@/lib/invoice-date";
import {
  INVALID_AMOUNT_HINT,
  formatAmountInput,
  netFromGross,
  parseGermanAmount,
} from "@/lib/parse-amount";
import type { ExpenseCorrection, ExpenseDetail } from "@/lib/supabase/queries/expense-detail";
import { ReceiptLink } from "@/components/receipt-link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

// Correcting a paid expense (d4u_backend migration 0038, implementation doc
// §2I): a final invoice, a Gutschrift or a bank statement changes what was
// really paid. Accounting only, shown when the backend permits
// correctPaidExpense. The document is uploaded to the receipts bucket first,
// like every receipt; the backend then moves Ist by the difference and
// records the correction. The original receipt stays.

type VatRate = 0 | 7 | 19;

function asVatRate(value: number | null | undefined): VatRate {
  return value === 0 || value === 7 ? value : 19;
}

function signedEUR(amount: number): string {
  return `${amount > 0 ? "+" : ""}${fmtEUR(amount)}`;
}

export function CorrectPaidExpenseCard({ expense }: { expense: ExpenseDetail }) {
  const router = useRouter();
  const today = todayInBerlin();
  const initialVatRate = asVatRate(expense.paymentDetails?.vatRate);

  const [open, setOpen] = useState(false);
  // Amounts kept as typed text and parsed on submit, as in MarkPaidCard.
  const [amountText, setAmountText] = useState(formatAmountInput(expense.amount));
  const [vatRate, setVatRate] = useState<VatRate>(initialVatRate);
  const [netAmountText, setNetAmountText] = useState(
    formatAmountInput(
      expense.paymentDetails?.netAmount ?? netFromGross(expense.amount, initialVatRate),
    ),
  );
  const [invoiceNumber, setInvoiceNumber] = useState(expense.invoiceNumber ?? "");
  const [invoiceDate, setInvoiceDate] = useState(expense.invoiceDate ?? "");
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const amount = parseGermanAmount(amountText);
  const netAmount = parseGermanAmount(netAmountText);
  const amountIsValid = !isNaN(amount) && amount > 0;
  const preview = amountIsValid
    ? correctionPreview(expense.budgetLine, expense.amount, amount)
    : null;

  // Net follows gross and VAT, as when marking paid; still editable.
  const handleAmountChange = (text: string) => {
    setAmountText(text);
    const gross = parseGermanAmount(text);
    if (!isNaN(gross) && gross > 0)
      setNetAmountText(formatAmountInput(netFromGross(gross, vatRate)));
  };
  const handleVatRateChange = (value: string) => {
    const rate = asVatRate(Number(value));
    setVatRate(rate);
    if (amountIsValid) setNetAmountText(formatAmountInput(netFromGross(amount, rate)));
  };

  const isValid =
    amountIsValid &&
    !isNaN(netAmount) &&
    netAmount > 0 &&
    (invoiceDate === "" || isAllowedInvoiceDate(invoiceDate, today)) &&
    reason.trim().length > 0 &&
    file !== null;

  const handleSubmit = async () => {
    if (!isValid || !file) return;
    setSubmitting(true);
    try {
      const documentRef = await uploadReceipt(file, expense.projectCode ?? "unbekannt");
      await callBackend("expenses.correct", {
        expenseId: expense.id,
        expectedAmount: expense.amount,
        amount,
        netAmount,
        vatRate,
        invoiceNumber: invoiceNumber.trim() || null,
        invoiceDate: invoiceDate || null,
        reason: reason.trim(),
        documentRef,
      });
      toast.success("Beleg korrigiert");
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error("Beleg konnte nicht korrigiert werden", {
        description: backendErrorMessage(error),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="bg-card ring-1 ring-line card-shape p-6">
      <h2 className="font-semibold text-sm mb-1">Beleg korrigieren</h2>
      <p className="text-xs text-muted-foreground mb-4 max-w-lg leading-relaxed">
        Wenn sich nach der Zahlung der tatsächliche Betrag ändert (Schlussrechnung, Gutschrift),
        korrigieren Sie den Beleg hier. Das Ist der Kostenstellen-Gruppe wird um die Differenz
        angepasst; der ursprüngliche Beleg bleibt erhalten.
      </p>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <FilePen className="size-4" /> Beleg korrigieren
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Beleg korrigieren</DialogTitle>
            <DialogDescription>
              Die Korrektur wird mit Begründung und Beleg im Verlauf festgehalten.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs">
                  Brutto <span className="text-destructive">*</span>
                </Label>
                <Input
                  className="mt-1.5 font-mono"
                  type="text"
                  inputMode="decimal"
                  value={amountText}
                  onChange={(e) => handleAmountChange(e.target.value)}
                />
                {!amountIsValid && (
                  <p className="text-[11px] text-destructive mt-1">{INVALID_AMOUNT_HINT}</p>
                )}
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
                <Label className="text-xs">
                  Netto <span className="text-destructive">*</span>
                </Label>
                <Input
                  className="mt-1.5 font-mono"
                  type="text"
                  inputMode="decimal"
                  value={netAmountText}
                  onChange={(e) => setNetAmountText(e.target.value)}
                />
                {isNaN(netAmount) && (
                  <p className="text-[11px] text-destructive mt-1">{INVALID_AMOUNT_HINT}</p>
                )}
              </div>
              <div>
                <Label className="text-xs">Rechnungsdatum</Label>
                <Input
                  type="date"
                  className="mt-1.5"
                  max={today}
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Rechnungsnummer</Label>
              <Input
                className="mt-1.5 font-mono"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
              />
            </div>

            {preview && (
              <div className="text-xs bg-muted/40 border border-line card-shape p-3 space-y-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-muted-foreground">Ist ändert sich um</span>
                  <span className="font-mono font-semibold tabular-nums">
                    {preview.istChange === 0 ? "—" : signedEUR(preview.istChange)}
                  </span>
                </div>
                {preview.exceedsBudget && (
                  <p className="flex items-start gap-1.5 text-destructive leading-relaxed">
                    <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                    Die Kostenstellen-Gruppe überschreitet damit ihr Budget. Die Korrektur ist
                    trotzdem möglich.
                  </p>
                )}
              </div>
            )}

            <div>
              <Label className="text-xs">
                Begründung <span className="text-destructive">*</span>
              </Label>
              <Textarea
                className="mt-1.5"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="z. B. Schlussrechnung über den tatsächlichen Betrag"
              />
            </div>
            <div>
              <Label className="text-xs">
                Beleg zur Korrektur (z. B. Schlussrechnung, Gutschrift, Kontoauszug){" "}
                <span className="text-destructive">*</span>
              </Label>
              <label className="mt-1.5 flex items-center gap-2 border border-dashed border-border rounded-md px-3 py-2.5 text-xs cursor-pointer hover:border-clay/40 hover:bg-secondary/40 transition-colors">
                <UploadIcon className="size-3.5 text-ember" />
                <span className="truncate">{file ? file.name : "Datei auswählen"}</span>
                <input
                  type="file"
                  className="sr-only"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
              Abbrechen
            </Button>
            <Button onClick={handleSubmit} disabled={!isValid || submitting}>
              Korrektur speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

// --- History ---------------------------------------------------------------

export function CorrectionsCard({ corrections }: { corrections: ExpenseCorrection[] }) {
  return (
    <section className="bg-card ring-1 ring-line card-shape p-6">
      <h2 className="font-semibold text-sm mb-4">Korrekturen</h2>
      <ol className="space-y-5">
        {corrections.map((correction) => (
          <li key={correction.id} className="text-xs space-y-1.5">
            <div className="text-[10px] text-muted-foreground">
              {correction.correctedByName ?? "—"} · {fmtDateTime(correction.correctedAt)}
            </div>
            <dl className="space-y-0.5">
              <Change
                label="Betrag"
                from={fmtEUR(correction.oldAmount)}
                to={fmtEUR(correction.newAmount)}
              />
              {correction.oldNetAmount !== correction.newNetAmount && (
                <Change
                  label="Netto"
                  from={correction.oldNetAmount === null ? "—" : fmtEUR(correction.oldNetAmount)}
                  to={fmtEUR(correction.newNetAmount)}
                />
              )}
              {correction.oldVatRate !== correction.newVatRate && (
                <Change
                  label="USt-Satz"
                  from={correction.oldVatRate === null ? "—" : `${correction.oldVatRate} %`}
                  to={`${correction.newVatRate} %`}
                />
              )}
              {correction.oldInvoiceNumber !== correction.newInvoiceNumber && (
                <Change
                  label="Rechnungsnr."
                  from={correction.oldInvoiceNumber ?? "—"}
                  to={correction.newInvoiceNumber ?? "—"}
                />
              )}
              {correction.oldInvoiceDate !== correction.newInvoiceDate && (
                <Change
                  label="Rechnungsdatum"
                  from={
                    correction.oldInvoiceDate ? formatInvoiceDate(correction.oldInvoiceDate) : "—"
                  }
                  to={
                    correction.newInvoiceDate ? formatInvoiceDate(correction.newInvoiceDate) : "—"
                  }
                />
              )}
            </dl>
            <p className="text-foreground leading-relaxed whitespace-pre-line">
              {correction.reason}
            </p>
            <ReceiptLink documentRef={correction.documentRef} label="Beleg zur Korrektur ansehen" />
          </li>
        ))}
      </ol>
    </section>
  );
}

function Change({ label, from, to }: { label: string; from: string; to: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-muted-foreground w-28 shrink-0">{label}</dt>
      <dd className="font-mono tabular-nums">
        {from} → {to}
      </dd>
    </div>
  );
}
