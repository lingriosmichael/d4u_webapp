// Shared domain types + display/formatting helpers used across the app.
//
// This file used to also hold the mock fixture data (users, projects,
// expenses, ...) that stood in for the backend/Supabase before every screen
// was converted to real reads/writes. That fixture data is gone — every
// screen now reads from Supabase (see `lib/supabase/queries/*`) and writes
// through the backend (`lib/api.ts`). What's left here is genuinely shared:
// the domain enums/types and the formatting/label helpers multiple screens
// need the exact same version of (so a currency or date never renders two
// different ways depending which screen you're on).

export type Role = "project_manager" | "finance_manager" | "accounting" | "ceo" | "admin";

// Verified directly against the live expenses_status_check constraint
// (2026-09-03, pg_get_constraintdef — see d4u_backend/documentation/
// OPEN_DECISIONS.md). Two values this file previously guessed
// ("submitted_pending", "rejected") don't actually exist in the schema;
// "submitted" and "draft" do. Nothing currently produces a persisted
// "draft" row (every real create-expense route writes further along).
// "finance_approval" removed 2026-09-05 (documentation/approval_routing.md,
// backend: d4u_backend/src/types/domain.ts) — Finance Manager has no
// approval role under the new model; Accounting is the universal final
// approver, gated only by whether CEO review happens first.
// Three added by migration 0017 for the split-advance reconciliation flow
// (test-run/OPEN_DECISIONS.md item #2) — see d4u_backend/src/types/domain.ts
// for the full status-flow comment.
export type ExpenseStatus =
  | "draft"
  | "submitted"
  | "ceo_approval"
  | "accounting_approval"
  | "needs_changes"
  | "awaiting_payment"
  | "paid"
  | "submitted_unverified" // partner advances
  | "reconciled"
  | "awaiting_receipt" // split advance child, no receipt yet
  | "reconciliation_in_progress" // advance itself, split but not all receipts in
  | "reconciliation_submitted"; // advance itself, handed off to Accounting

// Excludes "draft" (never persisted — see the status-check note above).
// Shared between the (server-only) Auswertung expense-overview query and
// its (client) filter bar, so it lives here rather than in the query file
// — a client component importing anything from a "server-only"-guarded
// module fails the build.
export const OPEN_EXPENSE_STATUSES: ExpenseStatus[] = [
  "submitted",
  "ceo_approval",
  "accounting_approval",
  "needs_changes",
  "awaiting_payment",
  "submitted_unverified",
  "awaiting_receipt",
  "reconciliation_in_progress",
  "reconciliation_submitted",
];

export const ALL_EXPENSE_STATUSES: ExpenseStatus[] = [
  ...OPEN_EXPENSE_STATUSES,
  "paid",
  "reconciled",
];

export type ExpenseType = "standard" | "partner_advance";

// "not_required" per the live expenses_receipt_status_check constraint —
// not "not_applicable", which this file used until verified otherwise.
export type ReceiptStatus = "missing" | "attached" | "not_required";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  initials: string;
}

// ---- Formatting helpers -----------------------------------------------------

export function fmtEUR(n: number): string {
  return n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function statusLabel(s: ExpenseStatus): string {
  switch (s) {
    case "draft":
      return "Entwurf";
    case "submitted":
      return "Eingereicht";
    case "ceo_approval":
      return "CEO-Freigabe";
    case "accounting_approval":
      return "Buchhaltungsprüfung";
    case "awaiting_payment":
      return "Zahlung ausstehend";
    case "paid":
      return "Bezahlt";
    case "needs_changes":
      return "Korrektur nötig";
    case "submitted_unverified":
      return "Abrechnung offen";
    case "reconciled":
      return "Abgerechnet";
    case "awaiting_receipt":
      return "Beleg fehlt";
    case "reconciliation_in_progress":
      return "Aufteilung läuft";
    case "reconciliation_submitted":
      return "Bei Buchhaltung";
  }
}

export function statusTone(
  s: ExpenseStatus,
): "neutral" | "warning" | "info" | "success" | "danger" {
  switch (s) {
    case "paid":
    case "reconciled":
      return "success";
    case "awaiting_payment":
      return "info";
    case "needs_changes":
      return "danger";
    case "submitted_unverified":
    case "awaiting_receipt":
    case "reconciliation_in_progress":
      return "warning";
    case "reconciliation_submitted":
      return "info";
    default:
      return "neutral";
  }
}

// ---- Display helpers -------------------------------------------------------

// Single source of truth for role display labels — previously duplicated
// in app-shell.tsx and admin-view.tsx (both already import `Role` from
// here); consolidated 2026-09-04 rather than adding a third copy for the
// Auswertung expense overview.
export const roleLabels: Record<Role, string> = {
  project_manager: "Projektleitung",
  finance_manager: "Finanzleitung",
  accounting: "Buchhaltung",
  ceo: "Geschäftsführung",
  admin: "Administration",
};
