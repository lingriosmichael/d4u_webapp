D4U Finance Workflow Automation — Consolidated Implementation Specification

I consolidated the supplied project plan, master context, Technical Specification v2, Supabase setup guide, David clarification notes, database diagrams, column definitions, and build timeline.

For this consolidation, Technical Specification v2 is the primary source of truth because it explicitly says it supersedes the Master Context Summary where the schema, RPCs, approval routing, and open items changed. Where the other files contradict v2, I have not silently merged them; I flag those contradictions below.

The result is that the project is now substantially clearer than the older Project Plan: it is a 12-table, five-role finance workflow system with 5 transactional RPC functions, a three-area frontend, backend-controlled writes, Soll/Ist/Obligo accounting, a three-stage Vorschuss reconciliation process, and explicit accounting details at payment/reconciliation.

**Related documents (see §24 for detail):** `backend/CLAUDE.md` (backend engineering conventions), `frontend/CLAUDE.md` (frontend engineering conventions), `18_08_2026_Dienstleistungsvertrag_signed.pdf` (signed contract — see §24 for two known mismatches against this spec), `D4U_Finance_Brand_Guidelines.png` (visual identity reference). If you're an AI coding agent picking this project up, read §24 and §25 before writing any code — they cover the source-document map, contract constraints, and the actual repo/environment/CI setup, none of which is inferable from the business spec alone.

---

## 0. Architecture Revision Notice (proposed — not yet confirmed by David)

Technical Specification v2 names n8n as the workflow/business-logic layer sitting between the frontend and Supabase, handling validation, routing, and RPC invocation. That remains the _confirmed_ architecture until David signs off on a change.

This document now also carries a **proposed revision**, developed and recommended during implementation planning, replacing n8n with a custom backend for the authorization/business-logic layer. The rationale, in short:

- The core rule every workflow must enforce — `JWT → active user → role → current record state → allowed transition` — is repeated across roughly 18-20 workflows in the n8n design. In application code this is written once, as shared middleware, making it structurally impossible for one route to skip the check. In n8n it must be rebuilt or copy-pasted into each visual flow, which is a real risk for a system whose entire threat model is "someone bypasses the routing check."
- The project's own testing requirements (idempotency tests, per-role security tests, invalid-transition tests) are naturally expressed as automated test suites against application code. n8n workflows have no first-class test framework and are largely validated by manual clicking.
- n8n workflow JSON is not meaningfully diffable or code-reviewable in the way a TypeScript pull request is.
- D4U has no in-house IT/ops person. Next.js + TypeScript + Supabase is a mainstream, easy-to-hire-for stack; n8n is a narrower, more specialized skillset. A successor developer can pick up a tested TypeScript codebase far faster than reverse-engineering an undocumented workflow graph.
- Cost: running the backend as Next.js API routes on Vercel adds no new infrastructure (it rides on the Vercel plan already required for the frontend) and allows dropping the Hetzner VPS entirely if n8n is removed, along with the security hardening items that exist specifically to protect n8n as an internet-facing authorization gateway (VPN/IP allowlisting the n8n admin UI, non-guessable webhook paths, webhook rate limiting).

**What does NOT change under this revision:** the 12-table schema, RLS model, the five Postgres RPCs, the frontend build, the Soll/Ist/Obligo model, and every unresolved business decision listed in §20. Only the layer that validates and routes business writes moves from n8n workflows into a custom backend. Financial arithmetic and multi-row transactions remain in Postgres RPCs either way — that was correct in the original design and is unchanged here.

**Optional retained role for n8n:** a minimal, notification-only n8n instance may still be used for RocketChat/email fan-out and scheduled jobs (reminders, 90-day archival), triggered _after_ a write has already been validated and committed by the backend — never as something that decides whether a write is allowed. This is a much smaller, easier-to-secure surface than carrying the full authorization model.

This revision is presented to David as a recommendation: same database, same RPCs, same frontend, same open decisions — the "who's allowed to do what, when" logic moves from visual workflows into tested application code. Until confirmed, treat §1, §13, §16, §21 (Conflict A), and §22 below as containing both the original n8n-based text and the proposed backend-based revision, clearly marked.

---

## 1. What Phase 1 is actually building

The finished Phase 1 system should replace the current Flowwer/email/direct-message process with:

| Component                     | Implementation (confirmed)                                       | Implementation (proposed revision)                                                                          |
| ----------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Application                   | Next.js frontend                                                 | unchanged                                                                                                   |
| Hosting                       | Vercel                                                           | unchanged                                                                                                   |
| Database                      | Supabase Postgres                                                | unchanged                                                                                                   |
| Authentication                | Supabase Auth / SSO                                              | unchanged                                                                                                   |
| Documents                     | Supabase Storage                                                 | unchanged                                                                                                   |
| Automation / business logic   | n8n                                                              | **Custom backend (Next.js API routes on Vercel)**                                                           |
| Transactional financial logic | PostgreSQL RPC functions                                         | unchanged                                                                                                   |
| Notifications                 | RocketChat, with email fallback where required                   | unchanged in principle; called directly from the backend, or via a minimal notification-only n8n instance   |
| Dashboard                     | Recharts inside the application                                  | unchanged                                                                                                   |
| Advanced reporting            | Metabase is currently contradictory — decision required; see §15 | unchanged                                                                                                   |
| Infrastructure                | Hetzner VPS for n8n and potentially Metabase                     | Hetzner VPS only if a minimal notification-only n8n is retained; otherwise not required for the core system |
| Currency                      | EUR only                                                         | unchanged                                                                                                   |
| Accounting integration        | Manual bridge into Monkey Office; no API integration in Phase 1  | unchanged                                                                                                   |

The fundamental architecture remains:

Browser → Vercel → **Backend (custom API, or n8n under the original spec)** → Supabase

while read-only visualization can query Supabase directly under RLS. Financial arithmetic and multi-row operations belong in database RPCs, rather than being implemented as chains of n8n nodes or ad hoc backend code.

### Non-negotiable architectural rule

The latest technical specification says:

Frontend does not directly change business-critical data. Every business write goes through the backend.

The backend validates the request, user, role and state, then performs ordinary database operations or invokes the relevant PostgreSQL RPC.

That principle should be maintained throughout the implementation, regardless of whether the backend is n8n or custom application code.

---

## 2. User roles and responsibilities

There are five roles, not four. **Read together with §2C: Finance Manager's approval responsibility below ("under-threshold approval") was removed on 5 Sep 2026 — FM now only submits and initiates Umwidmung requests, same as any other non-approving role.**

| Role            | Main responsibility                                      |
| --------------- | -------------------------------------------------------- |
| project_manager | Submit expenses for own projects                         |
| finance_manager | Under-threshold approval; elevated operational role      |
| accounting      | Final financial authority, payments, reconciliation      |
| ceo             | Over-threshold/escalated approvals and approval reversal |
| admin           | System configuration only; never financial approval      |

Accounting is explicitly described as holding greater financial authority than Finance Manager. Finance Manager should no longer be treated as the equivalent financial authority separated only by workflow stage.

### Confirmed responsibility model

**Project Manager**

- submit expenses for permitted projects;
- view relevant project financial information;
- view their expense status.

**Finance Manager**

- submit expenses;
- approve/reject normal expenses below the configured threshold;
- may initiate an Umwidmung (Reassign) request — see §2A; whether other roles may also initiate one is still unconfirmed;
- org-wide visualization.

**Accounting**

- submit expenses;
- their own submission requires no approval;
- approve CEO self-submissions;
- mark standard expenses paid;
- enter accounting details;
- receive and reconcile Vorschuss documentation;
- **approve every Umwidmung (Reassign) request before it executes — confirmed, see §2A;**
- perform final bookkeeping-oriented actions;
- reporting/export access;
- org-wide visualization.

**CEO**

- submit expenses;
- over-threshold/escalated approval;
- sole confirmed role allowed to reverse an approval;
- own expense must be approved by Accounting;
- **does NOT hold direct Umwidmung/Reassign execute permission — confirmed, see §2A;**
- org-wide visualization.

**Admin**

- users, including setting each user's `approval_limit` at creation and editing it afterward — confirmed, see §2A;
- projects;
- partners;
- cost centers;
- cost-center groups;
- budget lines;
- settings;
- no approval authority.

The CEO and Accounting self-submission branches are already settled; Finance Manager self-submission is not.

**A sixth "base employee" role was considered and has been dropped** — see §2A. All five roles above submit expenses through the same frontend approval pipeline; there is no role that needs submission rights without the rest of the role model, so no new role was needed.

---

## 2A. Confirmed decisions from stakeholder email exchange (25 Aug 2026)

David answered a round of clarifying questions by email on 25 Aug 2026. This section records what was confirmed, what changed as a result, and what is still open. Where this contradicts earlier "unresolved" framing elsewhere in this document, **this section is authoritative** — the older text has been updated to match it, but is left visible in a few places for traceability.

### Confirmed, no implementation change (already matched the plan)

- **`approval_limit`** is set on each user at creation time by Admin, with an edit path for existing users afterward. This matches the schema decision already in place (`approval_limit` as a nullable `numeric(12,2)` on `users`, not on a role table) — nothing to rebuild, just formally confirmed.
- **Submit-expense access is universal across all five roles**, and it is strictly a _frontend_ permission into the approval pipeline — no role, including Accounting, writes directly to the database. This matches what was already planned; David's initial phrasing in the underlying conversation was about frontend access, not a proposal to allow direct DB writes for any role.

### Resolved — closes an open item

- **The proposed sixth "base employee" role is cancelled.** Since every existing role already has frontend submit access, there was no functional gap for a new role to fill. Do not add a CHECK-constraint migration for it, do not add it to any role dropdown, and remove it from the open-decisions list (§20).

### Confirmed — changes implementation work

- **Every Umwidmung (Reassign) now requires Accounting approval before it executes.** This is a new two-step flow, not a single direct action:
  1. An authorized role **requests** a reassignment (which role(s) may initiate is still open — see below).
  2. **Accounting approves** the request.
  3. Only on Accounting approval does the backend call `reassign_expense` (§9.4).
- **CEO does not hold direct Umwidmung/Reassign execute permission.** David's confirmation was that this is because Accounting approval is always required regardless of who initiates — read as "the CEO doesn't need direct execute rights since Accounting is always the approving gate," not as a statement that CEO can never be involved. If this reading is wrong, it needs correcting before RLS policies are finalized, since RLS/routing work was being locked in against this answer.
- This adds a new audit trail step: `approval_logs` needs to distinguish a reassignment _request_ from a reassignment _execution_ — see §8 and §9.4 for the specific action-name and RPC-boundary implications.

### Still open — needs a follow-up, not yet answered

- **Which role(s) may initiate/request an Umwidmung?** David settled who approves (Accounting) and who does not execute directly (CEO), but not who is allowed to submit the initial request. This is a narrower version of the pre-existing "exact Umwidmung executor roles" item in §20 — it has shrunk, not closed.
- **Can a submitter edit their own expense after submission but before approval, or must every correction go through the reject/"needs changes" cycle?** This question was raised in the same email thread and was **not answered** in David's reply — it needs a dedicated follow-up. It affects: (a) whether `expenses` needs an editable-while-`submitted` state at all, (b) whether this is a blanket rule or a `permissions[]`-style override per user, and (c) how much correction risk exists once approval-limit-based routing is live, since a mistaken submission that slips past its intended threshold currently has no self-service fix path.

---

## 2B. Confirmed decision: unused Vorschuss balance in reporting (5 Sep 2026)

Closes the §11/§20 open item "how to present an unused Vorschuss balance in reporting."

**What was asked:** whether the difference between an advance's original amount and its documented/reconciled spend (§11, "Unspent advance amount") needs to be visible anywhere, and to whom.

**What was confirmed:** it's genuinely useful to two roles — Accounting (owns reconciliation) and CEO (organisation-wide financial oversight, including noticing whether a partner is repeatedly given larger advances than they end up using) — and not needed by the other three roles, since it doesn't change anything they see or do.

**What it changes:** a "Vorschuss-Übersicht" section on Auswertung, visible only when the signed-in user's role is `accounting` or `ceo` (an app-level check, not an RLS restriction — `expenses`/`partners` reads are already broader under existing RLS). Lists every partner-advance expense with its original amount (`amount`), its reconciled amount (`reconciled_amount`), and the released/unspent difference between them. The difference is never stored — it's computed at read time (`amount - reconciled_amount`), since `reconciled_amount` is already written onto the placeholder row by `advance_reconcile` (§9, RPC 3) when it settles. No schema change, no new RPC, no new backend route — implemented as a direct Supabase read from the frontend, the same pattern the rest of Auswertung already uses (`d4u_webapp/src/lib/supabase/queries/visualization.ts`, `getAdvanceOverview()`). Both open (`submitted_unverified`) and already-reconciled advances are listed together, so Accounting/CEO see the whole picture without opening each advance individually; an advance that hasn't been reconciled yet shows "—" for the reconciled/released/date columns rather than a misleading zero.

**What's still open:** nothing — this fully closes the item. (The general open question of a proper Vorschuss reconciliation staging UI, §11 Stage 3/§12's known-gaps list, is unrelated and unaffected.)

---

## 2C. Confirmed decisions: approval-routing rewrite, Vorschuss redesign, and related resolutions (5–6 Sep 2026)

This section closes several items that were still open in §20 as of the last edit to this document, and records one unresolved documentation gap discovered while writing this section. **Where this contradicts earlier text elsewhere in this document (§2, §9.5, §10, §11, §13), this section is authoritative** — the older text is left in place for traceability but should be read as superseded.

**Source-document gap, flag before trusting anything below at face value:** `d4u_backend/CLAUDE.md`, `d4u_webapp/CLAUDE.md`, and migration `0009_approval_limit_and_routing_model.sql` all cite `d4u_backend/documentation/approval_routing.md` as the primary source for this rewrite, marking it 🟡 "implementer decision, not yet confirmed by the client in writing." That file does not exist anywhere in either repo as of this writing — only `d4u_backend/documentation/OPEN_DECISIONS.md` survives. Either the file was never committed, or it was deleted without updating the three places that still point to it. This needs a fix (recreate it from the two CLAUDE.md files' content, or repoint the citations) before treating the 🟡 status as anything other than "still not confirmed by David in writing" — the missing file doesn't change that status, but it does mean there's currently no single authoritative document for this rewrite, which is exactly the kind of drift §20's logging convention exists to prevent.

### Approval routing rewrite (implementer decision, 🟡 not yet confirmed by David in writing)

- **Finance Manager has no approval role at all anymore.** There is no `finance_approval` status. Finance Manager submits like every other role and routes purely on amount vs. their own `approval_limit` — this closes the §20 items "Who approves Finance Manager's own expenses?" and "What exactly differentiates Finance Manager authority from Accounting authority?" (answer to the second: Accounting is the universal final approver of every standard expense; Finance Manager approves nothing, ever).
- **`approval_limit` is a SUBMITTER attribute**, not an approver attribute — closes any ambiguity in §3.1's phrasing ("branches on the acting approver's personal approval_limit" was wrong; it's the submitter's). `numeric(12,2) NOT NULL DEFAULT 0` (migration 0009 tightened this from the nullable field §3.1 describes) — 0 is fail-closed (escalates to CEO), not "no limit."
- **The monetary threshold is confirmed at €1,000, per-user, not org-wide** — closes "What is the actual Finance Manager/CEO monetary approval threshold?" It is not a single figure everyone shares; each user's own `approval_limit` row is what's compared against their own submission amount.
- **Accounting is the universal final approver.** Status flow: `submitted` → (amount ≤ submitter's limit) → `accounting_approval`, or (amount > limit) → `ceo_approval` → `accounting_approval` → `awaiting_payment` → `paid`. CEO approval is additive, never terminal — it always still passes through `accounting_approval`.
- **Self-submission special cases, not generalized:** CEO's own expense skips straight to `accounting_approval`. Accounting's own expense also lands at `accounting_approval` at any amount, which makes it unavoidably self-approved — **accepted as a risk, not silently allowed**: every such routing decision logs a `self_approval_flagged` row (`approval_logs`). David explicitly declined the two further compensating controls that were proposed (a standing audit query, a CEO/Admin dashboard tile) — the log flag is the only one built, and that's final. Finance Manager's own expense has no special case — routes on amount like anyone else, closing the last open self-submission question.
- **Undo-approval authority widened to Accounting and CEO** (was CEO-only in §9.5/§2's original text) — closes "Does Accounting have authority to override an FM approval?" in spirit (there's no FM approval left to override; Accounting can now undo any `awaiting_payment` expense itself, same as CEO).
- **`expenses_status_check` (migration 0009, then 0017) now allows:** `draft, submitted, ceo_approval, accounting_approval, needs_changes, awaiting_payment, paid, submitted_unverified, reconciled, awaiting_receipt, reconciliation_in_progress, reconciliation_submitted`. §10's state-machine diagram only shows a subset of these and should be read as the standard-expense path only, not the full enum (see the Vorschuss redesign below for the advance-only statuses).
- **`approval_logs_action_check` gained:** `self_approval_flagged`, `reassignment_requested`, `escalated_to_ceo` (migration 0021 — logs the CEO-escalation branch itself, which previously executed correctly but left no audit trail), `advance_split`, `reconciliation_submitted`. `finance_approved` stays in the allowed set for historical rows even though nothing will log it again — not removed, since that would be a destructive migration for no benefit.

### Umwidmung initiator roles (closes the last open item from §2A)

**Confirmed 5 Sep 2026: Finance Manager, Project Manager, or CEO may initiate a reassignment request, by role alone — not tied to who submitted the expense.** Accounting and Admin cannot initiate one. This closes "Which role(s) may initiate/request an Umwidmung?" (§20, High priority). The rest of §2A/§9.4/§12's two-step propose→approve description is otherwise unchanged and still accurate.

### Vorschuss reconciliation redesign — supersedes §11's async parse/match/stage pipeline entirely

**The Excel-parsing "deterministic filename matching" design in §11 (Stage 3) was never built, and has been replaced with a different, simpler flow — not merely delayed.** Per `OPEN_DECISIONS.md`'s "Resolved this session (2026-09-05)" note, the fully-manual line-item form that was originally meant as an interim stand-in is now the permanent design, and it doesn't work the way §11 describes at all:

1. **Split.** The advance's original PM submitter uploads the partner's summary Excel (`POST /api/advances/:id/split`). This immediately splits the single advance placeholder into N real child expenses, each entering status `awaiting_receipt` — visible and actionable right away. Nothing here touches Obligo or Ist; the advance's own Obligo reservation is untouched until final confirm.
2. **Per-child completion.** The PM attaches a receipt and fills in cost center, VAT rate, booking key, etc. per child (manually — this is deliberately not automated, same "no AI/OCR, no automated matching" rationale as the original spec, just applied to a different mechanism than filename-matching).
3. **Submit.** Once every child has a receipt, the PM submits the batch (`POST /api/advances/:id/submit-for-reconciliation`) — status `reconciliation_in_progress` → `reconciliation_submitted`, logs `advance_split` / `reconciliation_submitted`.
4. **Commit.** Accounting confirms (`POST /api/advances/:id/reconcile/commit`, calling `advance_reconcile` — §9.3's RPC contract is unaffected), which is the point money actually moves: releases the advance's Obligo, books actuals into Ist per child, marks the placeholder `reconciled`.

There is no Excel-row-to-receipt-filename matching step, no "flag missing files" step, and no async job/polling requirement — §11's concern about serverless execution timeouts doesn't apply to this design, since parsing the summary Excel to create child rows is fast and the slow, human part (attaching receipts, filling fields) is already spread across ordinary synchronous requests. **`POST /api/advances/:id/reconcile/stage` from §13's route list does not exist and should be removed from that list** — it's replaced by `split` and `submit-for-reconciliation`. A dedicated "Vorschüsse" tab in the frontend now handles this flow, separate from the generic Expense Detail view's Documents-received/Reconcile actions described in §12D.

`local_amount` and `exchange_rate` columns were added to `expense_accounting_details` per child (migration 0017) to support the partner Excel's actual format (a "sum in local currency" + "exchange rate" pair, no currency-code cell) — the EUR `amount` column, the only figure that ever feeds Obligo/Ist, is always `local_amount / exchange_rate`. Exchange rates are partner-supplied and human-reviewed before final confirm; this project deliberately does not fetch or verify FX rates from an external source. §11's "no Phase-1 multi-currency/FX handling" framing (also §19) should be read narrowly: there's still no rate-fetching integration, but a manual FX field now exists specifically for Vorschuss reconciliation.

### Other resolutions confirmed in the same window, closing further §20 items

- **Project Manager → project assignment** (§20 "Newly identified structural gap"): confirmed 3 Sep 2026, `projects.lead_user_id` is authoritative, not informational — a project always has exactly one lead, permanently. No `project_members` table was added or is needed. `POST /api/expenses` enforces this for `project_manager` submissions; RLS scopes a PM to their own submissions plus expenses on projects they lead.
- **Cost center in multiple groups within one project** (§4.3, §20): confirmed no — enforced via the live `cost_center_group_members_one_group_per_project` constraint, no code change pending.
- **Unused Vorschuss balance in reporting**: already closed in §2B; unaffected by the Vorschuss redesign above beyond the fact that `reconciled_amount` is now written by the redesigned `advance_reconcile` call rather than the old staging pipeline.
- **Custom backend vs. n8n/Metabase** (§0, §20 BLOCKER): confirmed by the client — proceed with the custom backend, for now. This is an engineering-unblock, not the same thing as the signed contract's own mismatch being resolved in writing — see the new open item below.

### New open items surfaced in this window (not previously in §20)

- **The `approval_routing.md` dangling-reference gap** described at the top of this section.
- **Microsoft/Azure SSO** moved from "confirm the provider" to a confirmed client requirement (6 Sep 2026: "Es gab eine Anforderung von D4U: SSO über Microsoft als Login"). **Now has a written implementation plan** (`d4u_backend/documentation/MICROSOFT_SSO_IMPLEMENTATION_PLAN.md`, added after this section was last written): ~2–3.5 engineering days across four phases, fully blocked on D4U for two yes/no decisions (restrict to D4U's own tenant only? fully replace password login or keep it as a fallback?) and on someone with D4U's Microsoft 365 admin access registering the app — nothing here can start from the engineering side alone. See `d4u_backend/CLAUDE.md`'s "Deferred, not forgotten" note and `OPEN_DECISIONS.md` item 4 for the `public.users.id` re-pointing complexity this will require at cutover.
- **Supabase Auth/Storage production hardening**, deferred by explicit client decision pending more information: public signup still enabled at the Auth level (inconsistent with the admin-provisioned user model), no custom SMTP decision, Auth redirect/site URLs not yet pointed at a real domain, and the `receipts` Storage bucket has no file-size or MIME-type limit configured. See `OPEN_DECISIONS.md` item 2.
- **Backups (PITR) and Data Processing Agreements** (Supabase + Vercel, GDPR/DSGVO) — agreed as necessary, explicitly scheduled for the very end of the production rollout rather than now. See `OPEN_DECISIONS.md` item 3.

## 2D. Reopened, NOT yet confirmed: should Vorschuss require an in-system approval gate? (raised 7 Sep 2026)

**Status: open question, raised by Michael (implementer side) — this is a proposal to reverse the §8/§2C confirmed decision below, not a new confirmed decision. Do not implement against this section until it is actually settled.**

**What's currently confirmed (§8, this doc; unaffected until this is resolved):** `settings.advance_requires_ceo_approval = false`, and the rule that "Vorschuss approval takes place outside the system and the system therefore does not introduce another approval gate." Per §11 Stage 1, a partner-advance placeholder currently has **no approval gate at all** — it enters Obligo immediately on creation, with no Accounting or CEO sign-off step anywhere before the money commitment is recorded.

**What's being questioned:** whether that's actually correct. The concern raised: Accounting needs visibility into the amount and needs to actively *Freigeben* (release/authorize) an advance before the money is sent to the partner — the current design has no such gate, only a later "documents received" checkpoint (§11 Stage 2, `submitted_unverified`) that is bookkeeping, not authorization. Separately, the existing €1,000 per-user `approval_limit` / CEO-escalation rule (confirmed in §2C for standard expenses) is not currently applied to advances at all — it's an open question whether it should be, verbatim or with its own variant.

**What this would change if confirmed as "yes, advances need approval":**
- A new pre-Obligo approval status/gate on the `partner_advance` lifecycle (§11 Stage 1 currently has none), most likely mirroring `accounting_approval` (and `ceo_approval` above the submitter's `approval_limit`, i.e. the €1,000 threshold) before the advance is allowed to reserve Obligo or before the payout can be treated as authorized in the system.
- `settings.advance_requires_ceo_approval` would flip to `true` and stop being just a placeholder value — its consumption logic doesn't exist yet and would need to be built.
- Updates to §8, §11, the `expenses_status_check` state machine (§2C), the RPC step that currently reserves Obligo on advance creation, the Vorschüsse tab's action set (currently no approve/reject action exists there — see the "Umwidmung genehmigen"/"Unterlagen eingegangen" screen, which has no approval button by design today), and both service CLAUDE.md files' Vorschuss descriptions.
- This is a contract-relevant change, not just an internal engineering call — see §24's note that scope beyond the signed contract needs written confirmation for the record, and §20's BLOCKER item on formally closing out routing decisions with David in writing. Whoever is the actual client-side stakeholder for this project should confirm this in writing before it's built as final, the same way the approval-routing rewrite itself is tracked as 🟡 pending that confirmation.

**What's still open:** the gate mechanism itself (mirror the standard-expense flow exactly, or a lighter Accounting-only gate with no CEO step regardless of amount?), whether the €1,000 `approval_limit` threshold applies to advances as-is or needs its own configurable threshold, and whether this blocks only new advances going forward or requires reconciling any already-`submitted_unverified` advances created under the old no-gate rule.

---

## 3. Database to implement: 12 tables

The current ERD is a 12-table database, and the visual database diagram reflects this revised structure, including project-scoped cost-center groups, group-level budget lines, expense self-references for Vorschuss reconciliation, the accounting-detail table, and separate approval/admin audit logs. This is unaffected by the architecture revision in §0.

### 3.1 users

Core fields: id, email, first_name, last_name, role, permissions[], **approval_limit**, active, created_at.

id must match auth.users.id.

active=false must effectively prevent the person's token from succeeding at backend validation, rather than merely hiding them from dropdowns. This applies whether validation happens in n8n or the custom backend. The permissions array remains in the design, but its actual values have not been agreed yet.

**approval_limit** — nullable `numeric(12,2)`. Confirmed per §2A: set by Admin at user creation, with an edit path for existing users. Lives on the individual user row, not on a role-level table, because two users with the same role can have different limits. Approval routing branches on the acting approver's personal `approval_limit` at the time of approval, not a role-wide constant.

### 3.2 partners

Fields: id, name, contact_email, active, created_at.

Partners are records, not users. There is no partner role, partner login, or partner frontend in Phase 1. Advance information is entered by D4U staff.

### 3.3 projects

Fields: id, name, code, funding_program, status, lead_user_id, start_date, end_date, created_at.

Important changes from the older Project Plan: there is no programs table; funding_program is just a descriptive donor/grant label; there is no program-level budget ceiling in Phase 1.

code is unique and is also used for receipt-storage paths.

---

## 4. Cost-center and budget model

This is one of the largest changes from the early design.

### 4.1 cost_centers

Global accounting codes such as: 23101 Überweisung an Partner, 23106 Projektfinanzen.

Fields: id, name, code, active.

Cost centers no longer hold budgets. They are a bookkeeping/reporting classification dimension.

### 4.2 cost_center_groups

Project-specific umbrella categories.

Fields: id, project_id, name, created_at.

Example: A project might have a group called Umwelt, containing several cost centers.

This group is where budget allocation takes place.

### 4.3 cost_center_group_members

Join table: group_id, cost_center_id. Unique on the pair.

This allows the same global cost center to be organised differently in different projects.

One rule is still unresolved: Can a cost center belong to multiple groups in the same project? Current assumption is no, but it has not been confirmed.

---

## 5. budget_lines and Soll / Ist / Obligo

Budget lines now operate at Project + Cost Center Group, not Project + individual Cost Center.

Fields: id, project_id, group_id, allocated_amount, consumed_amount, obligo_amount, warning_threshold_pct.

Definitions:

- Soll = allocated_amount — The approved budget.
- Ist = consumed_amount — Money actually booked/consumed.
- Obligo = obligo_amount — Committed but not finally booked/settled.

Budget utilisation: (Ist + Obligo) / Soll

Default warning threshold: 80%. This is explicitly a soft warning. There is no hard budget block in the confirmed model. Everything is in EUR and there is no currency/exchange-rate functionality.

---

## 6. expenses

The expense is the central operational record.

Important fields: id, submitted_by, project_id, budget_line_id, cost_center_id, partner_id, reconciles_advance_id, amount, reconciled_amount, description, vendor_name, invoice_number, expense_type, status, receipt_status, document_ref, assigned_approver, paid_at, metadata, created_at, updated_at.

### Expense types

standard or partner_advance.

### Critical relationship

budget_line_id identifies the group-level budget. cost_center_id identifies the actual accounting code within the group.

Therefore the backend must verify that the selected cost_center_id actually belongs to the group represented by the selected budget_line_id — before this was an n8n validation step, it is now a backend API validation step. The rule itself is unchanged.

---

## 7. Accounting detail model

### expense_accounting_details

One accounting-detail record per invoice-bearing expense.

Fields: expense_id, booking_key, vat_rate, net_amount, ksk_liable, supplier_vat_id, supplier_address, supplier_bank_name, filled_by, filled_at.

Required fields: booking key; VAT rate — 19%, 7% or 0%; net amount; KSK liability.

Optional: supplier VAT ID; supplier address; supplier bank.

Net amount should be calculated automatically from gross and VAT but remain editable.

For a standard expense, the record is added when Accounting marks it paid. For Vorschuss reconciliation, the accounting details belong to each itemized child expense, not the advance placeholder.

Monkey Office booking number is deliberately not stored because it does not exist yet at this point in the process. Credit-card details must never be stored.

---

## 8. Audit model

### approval_logs

Expense lifecycle history.

Actions currently include: submitted, requested_changes, resubmitted, finance_approved, ceo_approved, accounting_approved, budget_incremented, documents_received, advance_reconciled, **reassignment_requested, reassignment_approved**, reassigned_budget_line, marked_paid, reminder_sent, approval_reversed.

**Updated per §2A:** `reassigned_budget_line` alone is no longer sufficient to describe an Umwidmung, now that every reassignment requires a separate Accounting approval step before it executes. Split into two distinct actions: `reassignment_requested` (logged when the initiating role submits the request — from_status/to_status stay at the expense's current status, since nothing has moved yet) and `reassignment_approved` (logged by Accounting; this is the action that should immediately precede the actual `reassigned_budget_line` entry once `reassign_expense` executes). This keeps the request and the execution independently auditable, which matters given Accounting approval is now a mandatory gate rather than an assumed formality.

Fields: id, expense_id, actor_id, action, from_status, to_status, note, created_at.

A note is mandatory for rejection and approval reversal.

### admin_audit_log

Separate audit history for administrative changes: id, actor_id, table_name, record_id, change_summary, created_at.

Every administrative modification should be traceable independently of financial approval history, regardless of whether the write originated from an n8n workflow or a backend API route.

### settings

Key/value settings table.

One confirmed setting is: advance_requires_ceo_approval = false

This is not merely a default — the current confirmed rule is that Vorschuss approval takes place outside the system and the system therefore does not introduce another approval gate.

---

## 9. Five PostgreSQL financial RPC functions

The old timeline refers to four RPCs. That is now outdated. The current specification has five. **This section is entirely unaffected by the §0 architecture revision** — these were always meant to be Postgres functions, called by whichever layer sits in front of them (n8n or the custom backend).

### 9.1 budget_update(expense_id)

Called when an expense reaches awaiting_payment. It: identifies its budget line; increments Obligo; never increments Ist at this stage; must be idempotent; records budget_incremented.

No duplicate financial posting may occur because the calling layer retries the same request.

### 9.2 confirm_payment(expense_id, accounting_details)

Standard expenses only. Atomically: insert accounting details; decrease Obligo; increase Ist; change expense to paid.

### 9.3 advance_reconcile(advance_expense_id, line_items[])

For each reconciled invoice: create an itemized child expense; link with reconciles_advance_id; set child to paid; assign its specific cost center/budget line; insert its accounting-details record; increase that budget line's Ist.

After all lines: release the original advance Obligo; calculate reconciled_amount; set the advance placeholder to reconciled.

If the reconciled total is lower than the original advance, the difference returns to available budget. It is not tracked as a receivable from the partner in Phase 1.

### 9.4 reassign_expense(...)

Umwidmung. Confirmed meaning: reassign an expense, not transfer the Soll budget itself.

It may move an expense to: another project; another budget group; potentially another cost center.

Reassignment is blocked once the expense is paid or reconciled.

**Updated per §2A: this RPC is no longer called directly by whichever role initiates the reassignment.** Every Umwidmung now requires Accounting approval before execution — the RPC should only ever be invoked by the backend route handling _Accounting's approval action_, never by the initiating role's request action. Concretely: the request step writes `reassignment_requested` to `approval_logs` and does not touch `expenses` or call this RPC at all; only Accounting's approval step calls `reassign_expense`, and it should be the same call site that then logs `reassignment_approved` immediately followed by `reassigned_budget_line`. CEO does not have direct execute permission on this RPC under the current confirmation (see §2A for the caveat on how that was phrased). Which role(s) may perform the _request_ step is still unconfirmed — do not hardcode this to Finance Manager alone without checking, since only the approval side (Accounting) and one exclusion (CEO, from direct execution) have actually been confirmed.

Whether a same-group, cost-center-only change needs to be its own supported Umwidmung variant remains open.

### 9.5 undo_approval(expense_id, reason)

~~CEO-only under the current model.~~ **Widened 5 Sep 2026 to Accounting or CEO — see §2C.** Allowed only while status = awaiting_payment.

It: reverses the approval; sends the record back to submitted; requires a reason; records approval_reversed.

---

## 10. Standard expense lifecycle

**Superseded 5 Sep 2026 — see §2C.** There is no `finance_approval` stage; Finance Manager has no approval role. Accounting is the universal final approver. The diagram below is kept for historical reference — read `submitted → accounting_approval → awaiting_payment` (under-threshold) and `submitted → ceo_approval → accounting_approval → awaiting_payment` (over-threshold) in its place.

The standard workflow should be implemented around this state machine:

```
submitted
    ↓
finance_approval
    ↓
under threshold → awaiting_payment

or

over threshold / escalated
    ↓
ceo_approval
    ↓
awaiting_payment
    ↓
Accounting: Mark as paid + accounting details
    ↓
paid
    ↓
archived after 90 days
```

When approval reaches awaiting_payment: Obligo increases.

When Accounting completes payment: Obligo decreases and Ist increases.

Rejection: approval → needs_changes → user edits/resubmits → submitted → approval routing starts again.

CEO reversal: awaiting_payment → submitted, with a mandatory reason.

The detailed state machine, including 90-day archival, is defined in v2.

### Self-submission branches

**CEO submits own expense:** submitted → accounting_approval → awaiting_payment. Finance/CEO approval is bypassed.

**Accounting submits own expense:** submitted → awaiting_payment. No approval.

**Finance Manager submits own expense:** Not decided yet. This must not be hard-coded until D4U confirms the approver.

### Missing value

The documentation consistently refers to "under threshold" and "over threshold", but the supplied materials do not provide the actual monetary threshold. That number is therefore another required configuration/decision before the approval router can be considered complete — this applies identically whether the router lives in n8n or the custom backend.

---

## 11. Vorschuss / partner advance workflow

**Superseded 5 Sep 2026 — see §2C.** The three-stage parse/match/stage pipeline described below was never built; it was replaced with a PM-driven split → per-child receipt entry → submit → Accounting-confirm flow. The RPC contract in §9.3 is unaffected, and the "no AI/OCR, deterministic only" principle still holds — only the mechanism changed, from filename-matching to manual per-line entry. §2C also lists the new statuses (`awaiting_receipt`, `reconciliation_in_progress`, `reconciliation_submitted`) and routes involved. The rest of this section is kept for historical reference.

The advance model is now settled as a three-part process. Unaffected by §0.

**Stage 1 — Advance placeholder.** Create an expenses record with expense_type = partner_advance and the partner. There is no approval gate. The advance enters the financial process and its amount is placed into Obligo. No accounting-detail record is created at this point because there is not yet a final invoice.

**Stage 2 — Documents received.** Partner provides a standard Excel Abrechnung template and receipt files/folder. Accounting marks documents received. State becomes submitted_unverified. The system parses and stages data but does not immediately commit it.

**Stage 3 — Reconciliation.** The system: reads Excel rows; matches each row to the receipt filename; flags missing files rather than guessing; shows staged lines for human review; asks Accounting to provide/confirm accounting details per line; commits itemized child expenses; links them to the original placeholder; releases the original Obligo; books actual reconciled amounts into Ist; marks placeholder reconciled.

This is explicitly deterministic and not AI/OCR-driven.

Given the reconciliation step involves parsing an Excel file and matching potentially many receipt filenames, it may run long enough to exceed a typical serverless request timeout. Under the custom-backend revision, this should be implemented as an asynchronous job that the backend kicks off and the frontend polls for staged results, rather than a single blocking API call — this is a backend implementation detail, not a change to the business process itself.

### Unspent advance amount

If Advance = €10,000 and Final valid expenses = €8,700, then: €10,000 Obligo is released; €8,700 becomes Ist; €1,300 returns to available budget. There is no Phase-1 "partner owes D4U €1,300" balance.

**Confirmed 5 Sep 2026 — see §2B:** the released difference is now shown in reporting, in a Vorschuss-Übersicht panel on Auswertung, restricted to Accounting and CEO.

---

## 12. Frontend to implement

The current application should have three navigable areas, plus a fourth contextual detail view. Unaffected by §0.

### A. Upload

Used for expense submission. Standard expense form should support at least: project; budget line / group; valid cost center belonging to that group; amount; description; vendor; invoice number where applicable; receipt/document; expense type.

For partner advance: partner becomes relevant; invoice/accounting details are not required at initial payout.

No AI prefill. No OCR.

### B. Admin

Manage: users; partners; projects; cost centers; cost-center groups; group membership; budget lines; settings.

Every change must be auditable, regardless of whether the write path is n8n or the custom backend.

### C. Visualization

Recharts dashboard containing: Soll; Ist; Obligo; budget utilisation; warning at configured threshold; pending approvals / "Needs your action"; open advances; group-level totals; cost-center drill-down; relevant expense lists.

### D. Expense Detail

Not a primary navigation section. Opened from a dashboard/list or notification.

Depending on user and state, it shows only the valid actions: Approve; Reject; Reassign (Umwidmung); Undo approval; Mark as paid; Documents received; Reconcile.

Invalid actions should not simply appear disabled; the current specification says they should not be shown at all. This determination is made by the backend (role + status), and the frontend renders whatever the backend authorizes — never a client-side-only permission check.

**Updated per §2A: "Reassign" is now two distinct actions, not one.** An authorized initiating role sees "Umwidmung vorschlagen" (propose reassignment) on an eligible expense; Accounting sees "Umwidmung genehmigen" (approve reassignment) on expenses with a pending reassignment request, as a distinct pending-action item alongside their other approval work. CEO should not see a direct "Reassign" action at all under the current confirmation. Which role(s) see the "propose" action is still unconfirmed (see §2A) — do not wire this to Finance Manager alone without checking.

This also supersedes the older Project Plan's separate Approval Inbox concept. Pending actions belong within Visualization/Expense Detail rather than requiring an independent approvals module.

### Known gaps in the current build vs. this spec (mockup reviewed 1 Sept 2026)

A Lovable-built mockup already exists covering Übersicht, Beleg-Upload, Auswertung, Expense Detail, and Verwaltung. Reviewed against this spec, the following gaps were identified and are still outstanding as of this writing — treat this as a concrete backlog, not just narrative:

- **Auswertung** currently has a "Metabase öffnen" button. Remove it — Metabase inclusion is unresolved (§20), the UI should not presuppose it.
- **Beleg-Upload**'s Standardbeleg description hardcodes the approval chain as "(Finanzleitung → CEO → Buchhaltung)" for every submission. This overstates a fixed sequence; routing branches on the (still-unconfirmed) threshold. Reword to reflect branching without stating a specific number.
- **Verwaltung (Admin)** exists with the right tabs (Nutzer, Projekte, Kostenstellen, Gruppen, Budgets, Partner, Einstellungen, Protokoll) but needs: an explicit "Deaktivieren" action on Nutzer, separate from generic "Bearbeiten," with confirmation; an `approval_limit` field on the Nutzer create/edit form (confirmed §2A); the Protokoll tab wired to real `admin_audit_log` rows rather than left as a stub; copy on the section subhead reworded away from language implying direct/instant database writes bypass backend validation.
- **Expense Detail** currently has only a fixed "Freigeben" / "Korrektur anfordern" pair. Needs to be rebuilt as role+status-driven (see §12D), including: Mark as paid sub-form, Undo approval (CEO, reason required), Documents received / Reconcile for partner advances, the two-step Umwidmung propose/approve split (§2A), assigned_approver display, a real receipt link instead of a static "Angehängt" label, and an expense_type badge.
- **Verlauf** (history panel) currently renders a single static "Eingereicht" entry instead of the full `approval_logs` timeline for the expense.
- **Vorschuss reconciliation staging UI** (parse → match → stage → review → commit, §11 Stage 3) does not exist yet in the mockup.
- **Auswertung** budget bars don't yet reflect the soft-warning color state at `warning_threshold_pct`, and there's no group/cost-center drill-down or open-advances list.
- List/card views (Übersicht task cards, etc.) don't yet show `expense_type` / `receipt_status` badges.

See `frontend/CLAUDE.md` for the same list framed as engineering conventions to follow while closing these gaps.

---

## 13. Backend workflows to implement

### Confirmed (original spec): n8n workflows

The older planning estimate described roughly 18–20 workflows, but the current technical spec defines behaviour rather than a fixed workflow count. A practical breakdown derived from the confirmed behaviour is:

authenticate/validate incoming action; submit standard expense; route expense for approval; Finance Manager approve/reject; CEO approve/reject; Accounting approval for CEO self-submission; request changes; resubmit; enter awaiting_payment + call budget_update; Accounting mark standard expense paid + confirm_payment; create partner advance; mark advance documents received; parse/stage Excel + receipt folder; validate staged reconciliation; commit reconciliation + advance_reconcile; Umwidmung + reassign_expense; CEO undo approval; administrative CRUD operations; notifications; reminders; scheduled 90-day archive; historical open-advance import.

### Proposed revision: custom backend API routes

Under the §0 revision, the same behaviour list above becomes a set of typed backend API routes rather than visual workflows, sharing one authorization/state-transition middleware instead of duplicating that check per workflow:

- `POST /api/expenses` — submit standard expense or partner advance
- `POST /api/expenses/:id/approve` — Finance Manager or CEO approval, threshold-branching
- `POST /api/expenses/:id/reject` — request changes, note required
- `POST /api/expenses/:id/resubmit`
- `POST /api/expenses/:id/mark-paid` — Accounting only, calls confirm_payment
- `POST /api/expenses/:id/undo-approval` — CEO only, awaiting_payment only, reason required
- `POST /api/expenses/:id/reassign/request` — Umwidmung request, blocked once paid/reconciled; logs `reassignment_requested`; does not call reassign_expense. Initiator role(s) still unconfirmed per §2A.
- `POST /api/expenses/:id/reassign/approve` — Accounting only; logs `reassignment_approved`, then calls `reassign_expense` and logs `reassigned_budget_line`. This is the only route permitted to call the RPC.
- `POST /api/advances/:id/documents-received`
- ~~`POST /api/advances/:id/reconcile/stage` — parse Excel + match receipts, async job~~ — **never built; superseded, see §2C.** The actual Vorschuss reconciliation flow is:
  - `POST /api/advances/:id/split` — PM uploads the partner's summary Excel; splits the advance into N `awaiting_receipt` child expenses
  - `POST /api/advances/:id/submit-for-reconciliation` — PM submits once every child has a receipt attached
  - `POST /api/advances/:id/reconcile/commit` — Accounting confirms, calls advance_reconcile
- `GET /api/expenses/:id/permitted-actions` — not in the original spec; returns the set of actions the backend authorizes for the current user on this expense, backing the "server-authorized UI" rule in §12D/frontend CLAUDE.md
- `GET /api/expenses/:id/receipt` — not in the original spec; serves the actual receipt file link for Expense Detail (§12D)
- `POST/PATCH/DELETE /api/admin/*` — users, projects, partners, cost centers, groups, budget lines, settings, all writing to admin_audit_log
- Scheduled jobs (90-day archive, reminders) run as Vercel Cron or a minimal notification-only n8n instance, not as part of the request-serving API

Every route re-checks: JWT → active user → role → current record state → allowed transition, exactly as the original spec required of every n8n webhook — the check itself does not change, only where it is implemented and how many times it is duplicated (once, in shared middleware, instead of per-workflow).

Either way: every webhook or API route should re-check JWT → active user → role → current record state → allowed transition rather than relying on what the frontend displayed.

---

## 14. Authentication, receipts and notifications

### Authentication

Supabase Auth is confirmed. Unaffected by §0.

Microsoft/Azure SSO is the proposed provider, but Technical Spec v2 still lists confirmation of Microsoft as open. The setup guide describes how to configure it, but even that guide says the provider should be explicitly confirmed first.

If Microsoft is confirmed: enable Azure provider; use D4U M365 tenant registration; disable ordinary email/password self-registration.

### User provisioning

public.users.id references auth.users.id. A new person therefore has to be provisioned in Supabase Auth before their application user row can be created. There is, however, a write-path conflict here; see §21 Conflict A, now resolved differently under §0.

### Storage

Private bucket: receipts. Suggested path: receipts/<project_code>/<expense_id>/<filename>.

Regular users should have controlled read/upload permissions with no ordinary UPDATE/DELETE access.

### Notifications

Confirmed: notifications are sent for workflow actions via RocketChat DM, with email as fallback if RocketChat delivery fails.

Under the original spec, n8n sends these. Under the §0 revision, the custom backend calls the RocketChat/email integration directly after a write succeeds, or delegates to a minimal notification-only n8n instance — either is acceptable, since this is not part of the authorization-critical path.

The database already includes a reminder_sent approval-log action, but the supplied material does not define the exact reminder cadence, so reminder timing still needs to be set.

---

## 15. Reporting and export

Two parts, unaffected by §0.

### Confirmed: in-app reporting

Recharts should provide: Soll/Ist/Obligo; project totals; group totals; cost-center drill-down; open advances; pending actions.

### Donor/grant export

A donor/grant report should be filterable and usable by somebody preparing funder reporting. The tentative simple export is: project; likely date range; individual expense description; amount; cost center; date; status; summary by cost center; project Soll/Ist/Obligo totals.

Unconfirmed: exact columns; CSV vs formatted PDF/document; branding; one project vs multi-project export.

### Metabase conflict

Technical Specification v2: includes Metabase for deep reporting/export. Build Timeline: allocates a full Metabase implementation phase. David_D4U clarification: explicitly says "No Metabase; charts are built directly into the app with Recharts."

Therefore Metabase should currently be treated as a scope decision, not as settled implementation.

Recommended resolution (unchanged by §0): Recharts = mandatory. Simple donor export = Phase-1 requirement once format is confirmed. Metabase = do not spend build time on it until David/D4U explicitly reconfirms that they want it.

---

## 16. Security requirements

Implement the following, adjusted for the §0 revision:

**Unaffected either way:**

- RLS on Supabase;
- browser/database access read-only for business data;
- business writes through the backend (n8n or custom API);
- service-role credential never exposed to the browser;
- Vercel proxy hides the real backend endpoint where applicable;
- CORS limited to real application domains;
- MFA for Admin, CEO, Finance Manager and Accounting;
- reverse-proxy rate limiting;
- live JWT/user validation;
- role validation;
- state-transition validation;
- stateless requests;
- multiple Supabase sessions permitted;
- receipt bucket private.

**Original spec (n8n-specific):** n8n management interface behind VPN/IP allowlist; non-guessable webhook paths.

**Under the §0 revision:** these two items apply only if a minimal notification-only n8n instance is retained, scoped solely to that instance's admin UI and webhook trigger — not to the core authorization surface, since that no longer runs through n8n. If n8n is dropped entirely, these items are removed from the checklist. In their place, apply standard API-route hardening: rate limiting per route, input validation/schema checks on every request body, and the same audit logging on every write regardless of origin.

---

## 17. Historical data

The final specification supersedes the older idea of importing Flowwer history. Do not migrate historical Flowwer data in Phase 1.

The one historical mechanism that remains is: currently-open partner advances from their Excel template + receipt folders.

Process: Excel → parse → find referenced receipt filename → flag unmatched receipts → stage data → human review → commit.

The same parser/staging mechanism should therefore support both live future Vorschuss reconciliation and the one-time launch import of currently-open Vorschüsse — this prevents building two separate reconciliation systems, and applies whether the parser runs as an n8n workflow or a backend job (§0 recommends the latter).

The earlier Project Plan proposed writing seeded_historical to approval_logs for these imported entries. However, seeded_historical is missing from the current v2 action list. If that audit marker is still wanted, it needs to be added explicitly to the current schema/enum before implementation.

---

## 18. Testing / definition of done

Before production, the following should pass. Unaffected in substance by §0 — only the _how_ changes (automated test suites against backend code, rather than manual workflow execution).

**Database:** all 12 tables; foreign keys; group membership constraints; RLS; admin auditing; expense auditing; 5 RPC functions; migration Local → Staging → Production.

**Financial:** no duplicate Obligo on retried request; Finance approval produces correct Obligo; Accounting payment releases Obligo and increases Ist; advance reconciliation releases full advance Obligo; individual advance invoices correctly increase their own Ist; silent unspent balance produces correct available budget; Umwidmung moves financial exposure correctly; paid/reconciled records cannot be reassigned; CEO undo correctly rolls back awaiting-payment state.

**Workflow:** ordinary Project Manager expense; under-threshold approval; over-threshold/escalated approval; rejection/change/resubmission; CEO self-submission; Accounting self-submission; Finance Manager self-submission once the rule is agreed; standard payment; full Vorschuss lifecycle; partial-value Vorschuss reconciliation; receipt mismatch; Umwidmung; approval reversal; 90-day archival.

**Security:** every role; deactivated user; forged/stale request; direct browser business write fails; incorrect role action fails; invalid state transition fails; receipt access; API/webhook rate limiting; service-role key cannot reach client bundle.

**Operational hardening:** backup restore drill; retry/idempotency test; SPF/DKIM verification if email fallback is enabled; production TLS/DNS; role-specific handover/testing.

**Added under §0:** automated unit tests for the shared RBAC/state-transition middleware, covering every role × status × action combination; these should run in CI on every commit, not just before launch.

---

## 19. Items explicitly OUT of Phase 1

Do not allow these to creep into the implementation:

AI extraction; OCR; LLM categorisation; receipt AI validation; partner login; partner portal; Flowwer history migration; complete mailbox/email scraping pipeline; full Monkey Office API integration; program/grant-level budget ceilings; FX/currency conversion; high-availability infrastructure; receivable tracking for unused advances; support beyond the agreed support period.

---

## 20. Decisions that still need to be locked before the build is considered final

**Convention for logging new decisions:** when David (or another stakeholder) confirms something new, add a dated subsection formatted like §2A — what was asked, what was confirmed, what it changes, what's still open — rather than just editing the affected line in place elsewhere in this doc. Then: strike the corresponding row from the table below, update the affected sections in the body of this doc (schema, RPCs, frontend, routes) to match, and update the "Open decisions" / "Resolved" lists in both `backend/CLAUDE.md` and `frontend/CLAUDE.md` so the three documents don't drift apart. §2A is the template to copy.

**Newly added under this revision:**

| Priority | Decision required                                                                                        |
| -------- | -------------------------------------------------------------------------------------------------------- |
| BLOCKER  | Confirm or reject the §0 architecture revision (custom backend vs. n8n) with David before Phase 3 begins |

**Resolved via email exchange, 25 Aug 2026 — see §2A (removed from this table):**

- ~~Values/meaning of a possible sixth "base employee" role~~ — role cancelled, not needed.
- ~~Whether Accounting/other roles have frontend submit access~~ — confirmed universal across all five roles.
- ~~Whether `approval_limit` is set per-user and editable~~ — confirmed as designed.

**Resolved 5 Sep 2026 — see §2B (removed from this table):**

- ~~How to display released/unspent Vorschuss balance~~ — shown, not tracked as a new balance: a Vorschuss-Übersicht panel in Auswertung, Accounting/CEO only.

**Resolved 5–6 Sep 2026 — see §2C (removed from this table):**

- ~~Who approves Finance Manager's own expenses?~~ — nobody; FM has no approval role at all, routes on amount like anyone else.
- ~~What is the actual Finance Manager/CEO monetary approval threshold?~~ — €1,000, per-user `approval_limit`, confirmed final.
- ~~What exactly differentiates Finance Manager authority from Accounting authority?~~ — Accounting is the universal final approver of every expense; FM approves nothing.
- ~~How are Project Managers assigned to their "own projects"?~~ — `projects.lead_user_id` is authoritative (one lead per project, always), no `project_members` table needed.
- ~~Can one cost center belong to multiple groups within one project?~~ — no, enforced by a live DB constraint.
- ~~Does Accounting have authority to override an FM approval?~~ — moot; there's no FM approval left. Accounting/CEO can both `undo_approval` from `awaiting_payment`.
- ~~Which role(s) may initiate/request an Umwidmung?~~ — Finance Manager, Project Manager, or CEO, by role alone.
- ~~Custom backend vs. n8n/Metabase (as a development blocker)~~ — confirmed, proceed with custom backend for now (the contract paperwork itself is a separate, still-open item below).

**Still open, unchanged since the last edit to this document:**

| Priority | Decision required                                                                                                                                                                                                                                   |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BLOCKER  | **Can a submitter edit their own expense pre-approval, or must every correction go through reject/resubmit?** — raised 25 Aug, still not answered; interacts directly with approval-limit-based routing (see §2A)                                    |
| High     | Does Umwidmung support changing only cost_center_id inside the same group?                                                                                                                                                                            |
| High     | Values/meaning of permissions[] — a per-user permissions layer on top of role was proposed and declined; column stays reserved/unused, not deleted                                                                                                   |
| High     | Metabase: yes or no                                                                                                                                                                                                                                    |
| High     | Exact donor-export format                                                                                                                                                                                                                              |
| Medium   | Reminder cadence                                                                                                                                                                                                                                       |
| Medium   | Re-estimated effort/timeline                                                                                                                                                                                                                           |

**Newly identified, see §2C:**

| Priority | Decision required                                                                                                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High     | `d4u_backend/documentation/approval_routing.md` is cited by both CLAUDE.md files and migration 0009 as the primary source for the approval-routing rewrite, but does not exist in either repo — recreate it or repoint the citations   |
| High     | Formally close out the approval-routing rewrite's 🟡 status with David in writing — it is implemented and live, but per §2C is explicitly not yet client-confirmed                                                                    |
| High     | Microsoft/Azure SSO — confirmed client requirement, now has a written implementation plan (~2–3.5 engineering days); blocked entirely on two yes/no decisions from David plus D4U registering the app in their own Microsoft 365 tenant |
| Medium   | Supabase Auth/Storage production hardening (public signup, custom SMTP, redirect URLs, receipts bucket size/MIME limits) — deliberately deferred pending more usage information                                                       |
| Medium   | Backups (PITR) and Data Processing Agreements (Supabase, Vercel) — deferred to the very end of the production rollout by agreement, not forgotten                                                                                      |
| BLOCKER  | Contract paperwork: written client confirmation that the custom-backend approach (vs. the signed contract's n8n/Metabase wording) is acceptable, for the project's own record — see §24                                               |

**Newly raised, see §2D:**

| Priority | Decision required                                                                                                                                                                                                                       |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BLOCKER  | **Should a Vorschuss require an in-system Accounting (and, above the submitter's `approval_limit`, CEO) approval gate before payout/Obligo, reversing the confirmed `advance_requires_ceo_approval = false` rule in §8?** — raised 7 Sep 2026, not yet confirmed; needs written stakeholder sign-off given it also touches the contract paperwork item above |

### Newly identified structural gap: Project Manager project assignment

Unchanged by §0. The role model says a Project Manager submits and views their own projects. But projects.lead_user_id is explicitly described as informational only and grants no permission. There is currently no project_members / user_projects mapping table in the 12-table schema.

So, unless each project can only ever have exactly one Project Manager and lead_user_id is changed from informational to authoritative, the database currently lacks the relationship required to enforce "own projects." This should be resolved before finalizing RLS, regardless of which layer (n8n or custom backend) sits above it.

---

## 21. Source contradictions that should be cleaned up now

### Conflict A — writes-through-gateway vs. direct Admin writes

Technical Spec v2 and David's clarification say: all business writes through n8n. But the Supabase setup guide says existing Admin records can be modified directly from the client using RLS. Those cannot both be the canonical architecture.

Updated implementation recommendation, unchanged in principle by §0: keep the stricter architecture — Admin modifications also pass through the backend gateway (n8n under the original spec, or the custom API under the §0 revision) and are audited. The special Auth invitation operation can remain server-side, but the service-role design should be reconciled before deployment.

### Conflict B — Staging vs direct Production

Technical Specification v2 calls for Local → Staging → Production and labels the model confirmed. The Supabase setup guide later says staging is being skipped and changes are going directly into what becomes production.

For financial software, and given that the v2 architecture explicitly confirms three environments, the consolidated implementation should use Local → Staging → Production unless there has been a deliberate later D4U decision to remove Staging. Unaffected by §0.

### Conflict C — RLS scope

The role model says Project Managers see their own projects. But the setup guide's RLS test says an ordinary authenticated account can run `select * from public.expenses` and expects it to succeed broadly. That may expose more information than the role matrix intends.

Therefore the RLS policy set should be reviewed together with the missing project-membership model before it is considered production-ready. Unaffected by §0.

---

## 22. Recommended build sequence from this point

**Phase 0 — Close the blockers.** Resolve: the §0 architecture revision itself; FM self-approval; approval threshold; project membership; FM vs Accounting boundary; same-project group membership rule; Metabase; SSO provider; export requirements; Umwidmung permissions.

**Phase 1 — Freeze database model.** Finalize the 12 tables. Update the ERD and migration. Lock constraints and RLS.

**Phase 2 — Implement/test the 5 RPCs.** Especially: budget_update, confirm_payment, advance_reconcile, reassign_expense, undo_approval. Do retry/idempotency testing here, not at the end.

**Phase 3 — Build the authorization/business-logic layer.**

- _Original spec:_ freeze n8n webhook JSON request/response contracts for every frontend action.
- _§0 revision:_ build the shared RBAC/state-transition middleware and typed API routes (see §13), with unit tests covering every role × status × action combination, then freeze the request/response schema for each route.

**Phase 4 — Freeze API/webhook contracts.** Define the exact JSON request/response for every frontend action before building frontend and backend independently. Frontend and backend should then be built in parallel against frozen contracts rather than one after the other.

**Phase 5 — Frontend + backend.** Build: Upload, Admin, Visualization, Expense Detail, plus their underlying API routes (or n8n workflows, under the original spec).

**Phase 6 — Vorschuss/import system.** Implement one reusable parse → match → stage → review → commit pipeline. Use it for live reconciliation and open-advance import. Under §0, implement as an async job with polling rather than a blocking request.

**Phase 7 — Reporting/export.** Recharts first. Then the confirmed donor export. Metabase only if reconfirmed.

**Phase 8 — Security and hardening.** RLS testing; role testing; idempotency; rate limiting; MFA; backup restore; receipt permissions; SPF/DKIM; automated RBAC test suite in CI (added under §0). VPN/IP restriction for n8n's admin UI only if a minimal notification-only instance is retained.

**Phase 9 — Staging end-to-end acceptance.** Run real-world test scenarios with dummy/staging data. Do not test against real production finance records.

**Phase 10 — Production deployment.** Vercel; Supabase production; reverse proxy/TLS as needed; RocketChat; Hetzner + n8n only if the minimal notification instance is retained; Metabase only if included.

**Phase 11 — Training and handover.** Separate walkthroughs for: Project Managers; Finance Manager; Accounting; CEO; Admin. Admin gets deeper configuration and operational training. Under §0, handover also includes: repo structure, how migrations are run via Supabase CLI, and where the RBAC test suite lives as living documentation of the business rules — relevant given D4U has no in-house IT/ops person.

---

## 23. Timeline status

The old timeline assumed approximately 15–18 hours/week, a July 27 start, and a mid-October completion target. It scheduled database work first, frontend/n8n in parallel, then reporting, hardening, deployment, testing and handover.

That schedule should no longer be treated as the definitive project estimate: it still refers to four RPCs while the current design has five, Technical Spec v2 itself explicitly lists effort/timeline re-estimation as unresolved, and the §0 architecture revision (if confirmed) further changes the Phase 3-5 estimate. Keep mid-October as the historical target, but do not promise it again until the remaining blockers above — including the architecture decision — are closed and the revised work is re-estimated.

---

## 24. Source documents & contract

### Source documents this spec was consolidated from

Project plan, master context summary, Technical Specification v2 (primary source of truth per the opening note), Supabase setup guide, David clarification notes, database ERD (`Database_1.pdf`), column-by-column definitions (`Columns_1.pdf`), build timeline, and this document itself as the living consolidation. Additionally:

- `18_08_2026_Dienstleistungsvertrag_signed.pdf` — the signed service contract. See below for two known mismatches against this spec.
- `D4U_Finance_Brand_Guidelines.png` — visual identity reference (color palette, type scale, component states, voice/tone, misuse examples). Frontend work should match this rather than inventing new visual patterns.
- Lovable mockup screenshots (reviewed 1 Sept 2026) — see §12's "Known gaps in the current build" for the concrete backlog derived from them.
- `backend/CLAUDE.md`, `frontend/CLAUDE.md` — engineering-level conventions for each repo, meant to stay in sync with this document (see §20's decision-logging convention).

### The signed contract — what it locks in, and where it currently conflicts with this spec

The contract is between D4U (Auftraggeber) and Katrina Zuchina & Michael Fernando Ling Rios (Auftragnehmer), dated 26.08.2026, **fixed-price at €2,620 net**, invoiced in two tranches of €1,310 tied to defined milestones (Tranche 1: prep/analysis, 01.06–30.08.2026; Tranche 2: everything else, 31.08–15.11.2026), plus three months of post-launch technical support (15.11.2026–14.02.2027). Changes to the contract require **Textform** (§7 of the contract — a written/email exchange is sufficient, but it needs to actually happen and be on record).

Two known points where the contract's written scope doesn't match this spec, both requiring David's written confirmation before proceeding on the spec's version rather than the contract's:

1. **n8n and Metabase are named, priced deliverables in the contract**, not just implementation details. The Frontend & Automatisierungs-Workflows module explicitly commits to _"Umsetzung der zugehörigen n8n-Automatisierungsworkflows,"_ and the Deployment module commits to _"Hetzner für den Betrieb von n8n und Metabase."_ The §0 architecture revision (custom backend instead of n8n) and the still-open Metabase decision (§20) both deviate from what's actually signed. **Do not build the backend-as-custom-API version as if it were confirmed** until this written confirmation exists — build against whichever version David has actually signed off on in writing, and if that's still pending, flag it rather than guessing.
2. **The contract specifies four PostgreSQL RPC functions; this spec has five.** The fifth (`undo_approval`, CEO approval reversal) is a confirmed requirement elsewhere in the source material, so this is very likely just a drafting gap in the contract rather than a real scope disagreement — but it's still a real mismatch between a signed document and the build plan, and belongs in the same written-confirmation conversation as point 1 rather than being silently resolved in either direction.

The contract's module timeline is also useful as a real deadline check: the module containing the n8n/backend work runs 07.09–27.09.2026, and Testphase & Qualitätssicherung runs 26.10–08.11.2026 — use these as the actual dates when sequencing Phases 0-9 below, not just the general "mid-October" estimate in §23.

---

## 25. Engineering setup

This section covers the parts of "how to actually build this" that aren't inferable from the business spec above. If you're an AI coding agent, treat this as close to non-negotiable as §0's non-negotiable architectural rule — getting secrets or migration handling wrong here has real security consequences for a financial system.

### Repo layout

Two repos are assumed, matching the two CLAUDE.md files already written: a **frontend repo** (Next.js, deployed to Vercel) and a **backend repo** (Next.js API routes, also deployed to Vercel, under the §0 revision). This is a default, not a locked decision — if a monorepo turns out to be easier to manage given there's no in-house IT/ops person, that's a reasonable thing to revisit, but note it explicitly if changed so the two CLAUDE.md files can be merged/relocated accordingly rather than silently going stale.

### Environment variables

**Frontend (safe to expose to the browser, `NEXT_PUBLIC_*`):**

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_BACKEND_API_URL`

**Backend (server-only — never bundle these into a client build, never log them):**

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` — bypasses RLS; this is the credential §16 refers to as "must never reach the browser bundle." Treat any diff that moves this into a `NEXT_PUBLIC_*` variable or client-side file as a critical bug, not a style issue.
- `SUPABASE_JWT_SECRET` — for verifying incoming JWTs in the guard middleware, if not using Supabase's own verification helper.
- `DATABASE_URL` — direct Postgres connection string, needed for running migrations via Supabase CLI; not the same credential as the service-role key and should be scoped/rotated independently.
- `ROCKETCHAT_WEBHOOK_URL` — for notification fan-out.
- `EMAIL_FALLBACK_SMTP_*` (host/user/pass) — for the email fallback when RocketChat delivery fails.
- `APPROVAL_THRESHOLD_EUR` — placeholder for the still-unconfirmed monetary threshold (§20). Read from here (or a `settings` row, whichever is decided), never hardcode a number in route logic.
- `N8N_WEBHOOK_URL` — only if a minimal notification-only n8n instance is retained per §0.

### Local development

1. `supabase init` / `supabase start` — brings up local Postgres, Auth, and Storage emulation.
2. `supabase db reset` — applies all migrations in order and runs the seed script; this is the standard way to get a clean local database, not manual table creation.
3. Run the frontend and backend dev servers concurrently (`npm run dev` in each repo), with the frontend's `NEXT_PUBLIC_BACKEND_API_URL` pointing at the local backend's port.
4. Seed data should cover at least one user per role (including one with a distinct `approval_limit`) so role/status/limit combinations can be tested locally without needing production-like data.

### Environments

Local → Staging → Production, per the confirmed (§21 Conflict B resolution) three-environment model. Each of Staging and Production needs its own Supabase project (separate project refs, separate service-role keys) and its own Vercel environment/deployment target — never point a Staging frontend at the Production database or vice versa, and never test against real production finance records (§18 already requires this for the acceptance-testing phase; it applies throughout development too).

### Migrations

All schema changes are Supabase CLI migrations (`supabase migration new <name>`), timestamped, checked into the repo, and applied via `supabase db push` (or the CI pipeline's equivalent) — never made by hand through the Supabase dashboard, on any environment including Local. Migrations are append-only: once merged, don't edit a past migration file to fix a mistake — write a new migration that corrects it, so the migration history stays an honest record of how the schema evolved. This matters more than usual here given there's no in-house IT/ops person to reconstruct undocumented dashboard changes later.

### CI

At minimum, every pull request should run: the backend's RBAC/state-transition test matrix (every role × status × action combination — this is the single highest-value test in the project, per both CLAUDE.md files), any RPC idempotency tests, and a migration dry-run against a fresh database to catch broken migrations before they reach Staging. Treat a failing RBAC matrix test as a merge-blocker, not a warning — it's the closest thing this project has to a formal proof that the authorization model is correct.

**Implemented, confirmed in a working-tree sync 7 Sep 2026:** `.github/workflows/ci.yml` exists in both repos and runs on every push/PR to `main`: `npm ci`, lint + typecheck (`vercel:check`), the full test suite (378+ RBAC/state-transition tests plus the Excel-parser regression suite as of this writing), and a production build. The one test that needs a live database (`tests/rpc-idempotency.test.ts`) deliberately skips itself in CI rather than depending on a specific Supabase project's data or credentials — it only runs where a developer has real credentials in a local `.env`. This closes what was, until this sync, only a stated requirement rather than a verified fact — safe to cite as delivered, not aspirational, in any client-facing summary.

---

## Final implementation definition

The cleanest single-sentence description of what is now being built is:

A secure, role-based D4U finance application in which Supabase is the system of record, Next.js provides Upload/Admin/Visualization interfaces, a validated backend layer (custom API under the proposed revision, or n8n under the original spec) controls all finance workflows and notifications, PostgreSQL RPCs guarantee atomic Soll/Ist/Obligo changes, standard expenses move through approval and Accounting payment, partner advances are reconciled deterministically from Excel plus receipts into itemized booked expenses, and every financial/admin action is traceable — with no AI, no Flowwer migration, no partner portal and no full Monkey Office integration in Phase 1.

The database design and core financial model are now sufficiently defined to implement. **As of §2C (5–6 Sep 2026), most of the policy decisions this paragraph used to list as remaining are closed**: the §0 architecture revision, Finance Manager routing/authority, project membership/RLS, the approval threshold, and Umwidmung permissions are all resolved and live in the codebase. What remains is a shorter, different list — see §20's "Still open" and "Newly identified" tables: whether a submitter can self-correct pre-approval, Metabase/export scope, and a set of items that are process/paperwork rather than product decisions (the missing `approval_routing.md` file, closing out the 🟡-marked rewrite with David in writing, Microsoft SSO scoping, Auth/Storage hardening, backups/DPAs, and the signed contract's own written confirmation).
