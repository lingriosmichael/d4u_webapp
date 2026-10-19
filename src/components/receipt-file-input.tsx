"use client";

import { Upload as UploadIcon } from "lucide-react";

// The file picker for a receipt or a document on Expense Detail (Beleg
// korrigieren, Beleg nachreichen, Beleg ersetzen). The file is uploaded with
// uploadReceipt into the expense's project folder when the form is sent;
// the backend accepts it only from there.
export const RECEIPT_FILE_TYPES = ".pdf,.jpg,.jpeg,.png";

export function ReceiptFileInput({
  file,
  onChange,
  placeholder = "Datei auswählen",
  disabled = false,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="mt-1.5 flex items-center gap-2 border border-dashed border-border rounded-md px-3 py-2.5 text-xs cursor-pointer hover:border-clay/40 hover:bg-secondary/40 transition-colors">
      <UploadIcon className="size-3.5 text-ember" />
      <span className="truncate">{file ? file.name : placeholder}</span>
      <input
        type="file"
        className="sr-only"
        accept={RECEIPT_FILE_TYPES}
        disabled={disabled}
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
    </label>
  );
}
