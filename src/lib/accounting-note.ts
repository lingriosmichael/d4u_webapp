// The Buchhaltungsnotiz (d4u_backend migration 0037). Mirrors the backend's
// src/lib/accounting-note.ts so the form doesn't send a note the backend
// would refuse; the backend still re-checks.

export const ACCOUNTING_NOTE_MAX_LENGTH = 2000;

/** Whether `text` fits once trimmed, as the backend counts it. Empty is
 * allowed: saving an empty note clears it. */
export function isAllowedAccountingNote(text: string): boolean {
  return text.trim().length <= ACCOUNTING_NOTE_MAX_LENGTH;
}
