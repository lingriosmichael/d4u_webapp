# CLAUDE.md — D4U Finance Frontend

This file gives Claude Code the context it needs to work on the D4U Finance frontend. Read this before making changes.

**See also:** the root `CLAUDE.md` (workspace-wide conventions, security baseline, and engineering philosophy that apply here too — read it first if you haven't), `D4U_System_Implementation_Project_Instructions.md` (the full product/business spec — §12 has a concrete "known gaps in the current build" backlog derived from mockup review, §24 covers source documents including the brand guidelines and the signed contract, §25 covers repo/environment/CI conventions) and `backend/CLAUDE.md` (the sibling backend repo's conventions — read it if you're touching the API contract between the two). When a new stakeholder decision changes something in this file, it should already be logged in the implementation doc's §20/§2A-style section first — this file exists to restate that decision as an engineering/UI rule, not to originate it.

## What this is

D4U Finance is an internal expense-management system for a nonprofit ("D4U"), German-language UI ("D4U Finance — Interne Belegverwaltung"). This repo is the **frontend**: a Next.js app deployed on Vercel, with four areas — Übersicht (Übersicht/dashboard), Beleg-Upload (expense submission), Auswertung (reporting), and Verwaltung (Admin) — plus a contextual Expense Detail view opened from lists/notifications.

## Non-negotiable rule

**This frontend never writes business-critical data directly to Supabase.** All writes to `expenses`, `budget_lines`, `expense_accounting_details`, `approval_logs`, or `admin_audit_log` go through the backend API (a separate repo — see "Backend contract" below). This frontend may read directly from Supabase (RLS-scoped) for display purposes, but treat any write to a financial table that bypasses the backend API as a bug, not a shortcut, even for Admin screens.

**Never compute Soll/Ist/Obligo values client-side.** These come from the backend/database. Display them, don't derive or "helpfully" recalculate them — the arithmetic lives in Postgres RPCs for a reason (atomicity, idempotency).

**Server-authorized UI, not client-hidden UI.** Which actions a user can take on an Expense Detail screen (Approve, Reject, Mark as paid, Undo approval, Reassign, Documents received, Reconcile) is determined by the backend based on role + current status. The frontend renders whatever the backend says is valid for this user on this record — it does not independently decide to show/hide/disable a button based on a client-side role check alone. If the backend didn't authorize an action, don't render it, don't just disable it.

**Reassign/Umwidmung is a two-step action, not one button (confirmed 25 Aug 2026).** Don't build a single "Reassign" action that immediately executes. An authorized initiating role sees "Umwidmung vorschlagen" on an eligible expense — this only creates a request, it does not move the expense. Accounting sees a separate "Umwidmung genehmigen" action in their own pending-actions view for any expense with an open reassignment request — only this step actually executes it. CEO should not see a direct execute action for this at all under the current confirmation. Which role(s) get the "vorschlagen" action is still unconfirmed — don't wire it to Finance Manager alone without checking.

## Visual identity

Dark navy sidebar (`#0F1B3D`), off-white background (`#EEF1F5`), white cards, blue accent (`#2F5EE0`) reserved for interactive elements and key figures (never decorative gradients). One typeface family (Inter / Inter Tight), sentence case throughout — no ALL-CAPS eyebrows, no em-dash-joined metadata strings, no terracotta/warm-gradient or neon-dark-mode treatments. Currency figures always use tabular numerals so columns of amounts align. Full guidelines: `D4U_Finance_Brand_Guidelines.png` in project assets if present — check for it before inventing new visual patterns.

Copy is direct, Sie-form, plain German, no system jargon exposed to users ("Betrag konnte nicht gespeichert werden" not "RPC call failed"). Button labels state exactly what happens ("Freigeben", "Korrektur anfordern") and the resulting confirmation should echo the same verb.

## The four areas

### Übersicht (dashboard)
Task cards for pending actions assigned to the current user, plus a budget-status summary. Each expense card should show `expense_type` and `receipt_status` as badges so standard vs. partner-advance and missing/attached/not-required receipts are distinguishable at a glance.

### Beleg-Upload (submission)
Two entry points: Standardbeleg and Partner-Vorschuss — these have genuinely different field sets, don't try to unify them into one form. Standardbeleg needs: project, budget line/group, a cost center that actually belongs to the selected group (validate this client-side for UX, but the backend re-validates it — don't trust the client check alone), amount, description, vendor, invoice number, receipt upload, expense type. Partner-Vorschuss needs partner selection; invoice/accounting details are not required at initial payout.

Do not describe the approval chain as a fixed sequence in this UI's copy (e.g. "Finanzleitung → CEO → Buchhaltung" implies every expense goes through all three). Routing branches on a configurable threshold — word any explanatory copy to reflect that without stating a specific number, since the threshold itself isn't confirmed yet.

No AI prefill, no OCR — don't add "smart" receipt scanning even if it seems like an obvious UX win; it's explicitly out of scope for Phase 1.

### Auswertung (reporting)
Recharts-based dashboard: Soll/Ist/Obligo per project, utilization bars that shift to a warning color once `(Ist + Obligo) / Soll` crosses `warning_threshold_pct` — read this per-budget-line from the backend, don't hardcode 80%. Click-through from a project to its cost-center-group breakdown. A list (not just a count) of open advances, each linking to its detail.

Do not add a "Metabase öffnen" button or any Metabase reference — whether Metabase is used at all is an open decision, not something the UI should presuppose.

### Verwaltung (Admin)
Visible only to `admin` role. Tabs: Nutzer, Projekte, Kostenstellen, Gruppen, Budgets, Partner, Einstellungen, Protokoll — each following the same list + "X anlegen" + "Bearbeiten" pattern.

- **Nutzer**: role dropdown, plus an `approval_limit` field (confirmed 25 Aug 2026: set at user creation, editable afterward — include it in both the "Nutzer anlegen" and "Bearbeiten" forms). Do **not** add a `permissions[]` editor (values are unconfirmed) or a project-assignment field (no `project_members` table exists yet in the schema) — these are known gaps, not missing frontend work. There is no sixth "base employee" role to add to the role dropdown — that was proposed and then dropped (confirmed 25 Aug 2026); the five existing roles cover it. Deactivating a user (`active = false`) should be its own explicit, confirmed action, separate from generic "Bearbeiten," since it has real access-control consequences (it should block the user's JWT at the backend, not just hide them from dropdowns).
- **Gruppen**: group membership (which cost centers belong to which group, scoped per project) is editable here.
- **Budgets**: `allocated_amount` and `warning_threshold_pct` are editable per project+group. `consumed_amount` and `obligo_amount` are **read-only** in this UI — they're written only by backend RPCs, never by an admin edit.
- **Protokoll**: renders real `admin_audit_log` entries (actor, table, record, human-readable change summary, timestamp) — this is what makes "Änderungen ... im Änderungsprotokoll erfasst" true; don't leave it as a stub.
- Avoid copy that implies direct/instant database writes bypass backend validation (e.g. don't phrase things as "changes save directly to the database") — admin writes go through the same backend validation and audit path as everything else, they should just *feel* fast in the UI.

### Expense Detail
Opened from a list or notification, never a primary nav item. Shows:
- Belegdaten (amount, project, cost-center group, cost center, vendor, invoice number, description).
- `assigned_approver` name/role.
- A clickable link to the actual receipt (`document_ref`), not a static "Angehängt" label.
- `expense_type` badge.
- **Verlauf**: the full `approval_logs` timeline for this expense (actor, action, timestamp, note if present) — not a single static "Eingereicht" entry.
- **Ihre Entscheidung**: action panel driven by what the backend authorizes for this user + this expense's current status. Possible actions: Approve, Reject/request changes (note required), Mark as paid (Accounting, opens a sub-form for `booking_key`, `vat_rate`, `net_amount` auto-calculated but editable, `ksk_liable`, supplier fields), Undo approval (CEO only, `awaiting_payment` only, reason required), Documents received (partner advances), Reconcile (partner advances — for now, a staged-line-items review screen with a confirm button; full async polling for the Excel-parse job comes with the reconciliation pipeline), Reassign/Umwidmung propose or approve depending on role (see the two-step note above — never rendered at all once status is `paid` or `reconciled`, not just disabled).
- Note whether a submitter can edit their own expense before approval is still an open question (raised 25 Aug, unanswered) — don't build an "edit" action on a submitted-but-not-yet-approved expense until this is confirmed, even though it seems like an obvious gap to fill.

For `expense_type = partner_advance`, show a distinct field set: partner name, advance amount, current stage (Placeholder / Documents Received / Reconciled) — don't force it through the standard-expense layout.

## Backend contract

All writes go through the backend API (separate repo). Treat every write as a network call to that API — stub it if the backend route doesn't exist yet, but structure the call as if it does (proper request shape, loading state, error state), so wiring the real endpoint later is a one-line change, not a rewrite. Don't mutate local/optimistic state and treat that as the "real" write; reflect the backend's actual response.

If a backend call fails, show the error in the interface's voice, not a raw error message — explain what happened and what to do next, without blaming the user and without exposing internals (status codes, table names, RPC names) in user-facing copy.

## Things that are explicitly out of scope — don't build these unprompted

AI/OCR receipt extraction or "smart" prefill, partner login/portal, a full Excel-parsing UI beyond the staged-review screen described above, a `permissions[]` editor, a project-assignment UI for Project Managers, Metabase integration or linking, multi-currency display.

## Open decisions — don't let the UI presuppose an answer

If a screen would need one of these to be fully correct, use a clearly-labeled placeholder/config value rather than a specific number or hardcoded rule: the approval threshold amount, Finance Manager self-submission routing, `permissions[]` values, **which role(s) may initiate an Umwidmung request** (narrowed 25 Aug — Accounting approves, CEO doesn't execute directly, but the initiator role is still open), **whether submitters can edit a pre-approval expense** (raised 25 Aug, unanswered), donor-export format, Microsoft/Azure SSO status, reminder cadence, Metabase inclusion.

Resolved as of 25 Aug 2026, no longer placeholders: `approval_limit` is per-user and admin-editable (build it into the Nutzer form); submit access is universal across all five roles; there is no sixth role.
