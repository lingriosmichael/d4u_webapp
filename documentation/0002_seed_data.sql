-- =========================================================================
-- D4U Finance — Seed data for testing the Supabase connection (Phase 3)
-- =========================================================================
-- Mirrors src/lib/mock-data.ts's fixtures 1:1 (same projects, budget
-- lines, expenses, amounts) so what you see in the real app should match
-- what you already visually verified against the mock UI — a built-in
-- sanity check that the read layer is wired correctly.
--
-- Updated 2026-09-04 for the 2026-09-05 approval-routing rewrite
-- (d4u_backend/documentation/approval_routing.md): the two expenses that
-- used to sit in the now-retired 'finance_approval' status are corrected
-- to 'accounting_approval' (Finance Manager has no approval role at all
-- under the current model), and every seeded user now gets an explicit
-- approval_limit — the column exists live but nothing here used to set
-- it, so every seeded user silently fell back to the DB default of 0
-- (fail-closed: every submission escalates to CEO).
--
-- Recommended path for a full reset-and-reseed: run
-- d4u_backend/scripts/reset-and-seed.mjs instead of this file by hand —
-- it creates the Auth users, captures their real UUIDs, truncates old
-- data, and runs the equivalent of everything below in one idempotent
-- pass. This file is kept as the readable reference for what that script
-- does, and as a manual fallback.
--
-- Plain data inserts, not a schema/security change, so pasting this
-- directly into the Supabase SQL editor is fine for a single dev/sandbox
-- project (unlike ../../d4u_backend/supabase/migrations/, which specifically warns against
-- that for schema/security changes on staging/prod).
--
-- BEFORE RUNNING THIS BY HAND:
-- 1. Apply all of ../../d4u_backend/supabase/migrations/ in order first
--    (0000 through 0012) — this seed doesn't touch RLS or the schema, but
--    nothing is testable without them, and the status/action values below
--    only became valid once 0009 actually ran.
-- 2. Create Auth users via Dashboard -> Authentication -> Users. You only
--    strictly need one to log in, but creating a few lets you compare an
--    org-wide role against project_manager's narrower RLS scope
--    (submitted_by = auth.uid(), or a project they lead — see 0001 and
--    0007's KNOWN GAP / PM-scoping notes).
--    Turn on "Auto Confirm User" so you can log in immediately.
--
--      thomas.meier@d4u.example    -- project_manager
--      marcus.chen@d4u.example     -- finance_manager
--      sarah.weber@d4u.example     -- accounting
--      anna.krueger@d4u.example    -- ceo
--      hanna.kaufmann@d4u.example  -- admin
--
--    Any password. Skip whichever roles you don't need yet — just delete
--    their line from the `insert into public.users` block below and
--    remove references to their variable elsewhere in this file.
-- 3. Paste each created user's UUID (Authentication -> Users -> copy the
--    "User UID" column) into the `declare` block right below, replacing
--    the placeholder 00000000-... values.
--
-- Column names are cross-referenced against
-- d4u_backend/supabase/migrations/0000_initial_schema.sql (ground truth,
-- reconstructed from the live schema via introspection 2026-09-04) rather
-- than generated types (none exist yet, see src/lib/supabase/client.ts for
-- the command).
-- Wrapped in one transaction: if any insert fails (e.g. a column name is
-- wrong), everything rolls back rather than leaving a half-seeded database.
--
-- To re-run from scratch, uncomment the truncate block right before
-- `begin;` below — it only touches the tables this script writes to.
-- =========================================================================

-- truncate public.expenses, public.budget_lines, public.cost_center_group_members,
--   public.cost_center_groups, public.projects, public.cost_centers,
--   public.partners, public.users restart identity cascade;

begin;

do $$
declare
  -- >>> REPLACE with the real auth.users UUIDs from the dashboard <<<
  v_pm    uuid := '00000000-0000-0000-0000-000000000001'; -- Thomas Meier, project_manager
  v_fin   uuid := '00000000-0000-0000-0000-000000000002'; -- Marcus Chen, finance_manager
  v_acc   uuid := '00000000-0000-0000-0000-000000000003'; -- Sarah Weber, accounting
  v_ceo   uuid := '00000000-0000-0000-0000-000000000004'; -- Anna Krüger, ceo
  v_admin uuid := '00000000-0000-0000-0000-000000000005'; -- Hanna Kaufmann, admin

  -- Generated ids for everything else — no need to edit these.
  v_partner_lernhaus    uuid := gen_random_uuid();
  v_partner_kulturfonds uuid := gen_random_uuid();
  v_partner_sport       uuid := gen_random_uuid();

  v_cc_1001 uuid := gen_random_uuid();
  v_cc_1002 uuid := gen_random_uuid();
  v_cc_2001 uuid := gen_random_uuid();
  v_cc_3100 uuid := gen_random_uuid();
  v_cc_3200 uuid := gen_random_uuid();
  v_cc_4100 uuid := gen_random_uuid();
  v_cc_5000 uuid := gen_random_uuid();
  v_cc_6000 uuid := gen_random_uuid();

  v_prj_bib uuid := gen_random_uuid();
  v_prj_int uuid := gen_random_uuid();
  v_prj_str uuid := gen_random_uuid();

  v_grp_bib_kita    uuid := gen_random_uuid();
  v_grp_bib_sprach  uuid := gen_random_uuid();
  v_grp_bib_travel  uuid := gen_random_uuid();
  v_grp_int_partner uuid := gen_random_uuid();
  v_grp_int_ops     uuid := gen_random_uuid();
  v_grp_str_pers    uuid := gen_random_uuid();
  v_grp_str_travel  uuid := gen_random_uuid();

  v_bl_1 uuid := gen_random_uuid();
  v_bl_2 uuid := gen_random_uuid();
  v_bl_3 uuid := gen_random_uuid();
  v_bl_4 uuid := gen_random_uuid();
  v_bl_5 uuid := gen_random_uuid();
  v_bl_6 uuid := gen_random_uuid();
  v_bl_7 uuid := gen_random_uuid();
begin

  -- ---- users ------------------------------------------------------------
  -- id must equal the matching auth.users.id (FK) — this is why the Auth
  -- users have to exist first (step 2 above).
  --
  -- approval_limit choices below are deliberate, not the org-wide 1000 EUR
  -- default applied uniformly — same-role users are allowed to carry
  -- different limits by design (backend/CLAUDE.md). Thomas Meier is set
  -- to 500 specifically so this fixture exercises BOTH routing branches:
  -- his two smaller expenses (142.50, 249.00) go straight to
  -- accounting_approval, and his larger one (890.00) escalates to
  -- ceo_approval first — see the expenses block below. Marcus Chen and
  -- Hanna Kaufmann get the standard 1000 EUR default. Sarah Weber
  -- (accounting) and Anna Krüger (ceo) get 0 because their own
  -- approval_limit is never actually read for their own submissions —
  -- accounting and ceo both have dedicated bypass branches in
  -- resolveInitialReviewStatus (state-machine.ts) — so 0 documents "not
  -- applicable," not "escalates everything."
  insert into public.users (id, email, first_name, last_name, role, approval_limit, active) values
    (v_pm,    'thomas.meier@d4u.example',   'Thomas', 'Meier',    'project_manager',  500,  true),
    (v_fin,   'marcus.chen@d4u.example',    'Marcus', 'Chen',     'finance_manager',  1000, true),
    (v_acc,   'sarah.weber@d4u.example',    'Sarah',  'Weber',    'accounting',       0,    true),
    (v_ceo,   'anna.krueger@d4u.example',   'Anna',   'Krüger',   'ceo',              0,    true),
    (v_admin, 'hanna.kaufmann@d4u.example', 'Hanna',  'Kaufmann', 'admin',            1000, true)
  on conflict (id) do nothing;

  -- ---- partners -----------------------------------------------------------
  insert into public.partners (id, name, contact_email, active) values
    (v_partner_lernhaus,    'Lernhaus e.V.',       'buchhaltung@lernhaus.example',   true),
    (v_partner_kulturfonds, 'Kulturfonds Mitte',   'verwaltung@kulturfonds.example', true),
    (v_partner_sport,       'Sportfonds Neukölln', 'kontakt@sportfonds.example',     true);

  -- ---- cost_centers ---------------------------------------------------
  insert into public.cost_centers (id, code, name, active) values
    (v_cc_1001, '1001', 'Material',         true),
    (v_cc_1002, '1002', 'Honorare',         true),
    (v_cc_2001, '2001', 'Coaching',         true),
    (v_cc_3100, '3100', 'Reisekosten',      true),
    (v_cc_3200, '3200', 'Verpflegung',      true),
    (v_cc_4100, '4100', 'Personalkosten',   true),
    (v_cc_5000, '5000', 'Miete',            true),
    (v_cc_6000, '6000', 'Partnerzuwendung', true);

  -- ---- projects -----------------------------------------------------------
  insert into public.projects (id, code, name, funding_program, status, lead_user_id, start_date, end_date) values
    (v_prj_bib, 'BIB-24', 'Bildungsinitiative Berlin', 'BMFSFJ 2024', 'active', v_pm,  '2024-01-01', '2024-12-31'),
    (v_prj_int, 'INT-24', 'Integration Neukölln',      'Land Berlin', 'active', v_pm,  '2024-03-01', '2025-02-28'),
    (v_prj_str, 'STR-24', 'Strukturförderung 2024',    'BMI',         'active', v_fin, '2024-01-01', '2024-12-31');

  -- ---- cost_center_groups -----------------------------------------------
  insert into public.cost_center_groups (id, project_id, name) values
    (v_grp_bib_kita,    v_prj_bib, 'Kita-Ausbau Süd'),
    (v_grp_bib_sprach,  v_prj_bib, 'Sprachförderung'),
    (v_grp_bib_travel,  v_prj_bib, 'Reise & Verpflegung'),
    (v_grp_int_partner, v_prj_int, 'Partnerzuwendungen'),
    (v_grp_int_ops,     v_prj_int, 'Betrieb'),
    (v_grp_str_pers,    v_prj_str, 'Personal'),
    (v_grp_str_travel,  v_prj_str, 'Dienstreisen');

  -- ---- cost_center_group_members ------------------------------------------
  -- A cost center can only belong to one group per project — enforced by
  -- cost_center_group_members_one_group_per_project (this constraint was
  -- documented as already live since 2026-09-03 but was actually missing
  -- until d4u_backend/supabase/migrations/0011 added it, 2026-09-04; the
  -- fixture below was already written to respect it — cc_1002 (Honorare)
  -- appears only in Kita-Ausbau Süd, not also in Sprachförderung like
  -- mock-data.ts's looser fixture).
  insert into public.cost_center_group_members (group_id, cost_center_id) values
    (v_grp_bib_kita,    v_cc_1001),
    (v_grp_bib_kita,    v_cc_1002),
    (v_grp_bib_sprach,  v_cc_2001),
    (v_grp_bib_travel,  v_cc_3100),
    (v_grp_bib_travel,  v_cc_3200),
    (v_grp_int_partner, v_cc_6000),
    (v_grp_int_ops,     v_cc_5000),
    (v_grp_int_ops,     v_cc_4100),
    (v_grp_str_pers,    v_cc_4100),
    (v_grp_str_travel,  v_cc_3100);

  -- ---- budget_lines -------------------------------------------------------
  -- allocated/consumed/obligo below are hand-set to match exactly what
  -- mock-data.ts's budgetStatusForGroup() derives from the expenses seeded
  -- further down — in the real app these come from backend RPCs, not from
  -- this script, but matching them here makes the two UIs comparable.
  insert into public.budget_lines (id, project_id, group_id, allocated_amount, consumed_amount, obligo_amount, warning_threshold_pct) values
    (v_bl_1, v_prj_bib, v_grp_bib_kita,    22000, 640,  890,    80),
    (v_bl_2, v_prj_bib, v_grp_bib_sprach,  18000, 0,    0,      80),
    (v_bl_3, v_prj_bib, v_grp_bib_travel,  10000, 0,    142.5,  75),
    (v_bl_4, v_prj_int, v_grp_int_partner, 40000, 0,    8200,   80),
    (v_bl_5, v_prj_int, v_grp_int_ops,     25000, 0,    0,      80),
    (v_bl_6, v_prj_str, v_grp_str_pers,    60000, 1240, 0,      85),
    (v_bl_7, v_prj_str, v_grp_str_travel,  8000,  0,    249,    80);

  -- ---- expenses -------------------------------------------------------
  -- Same 8 rows as mock-data.ts's `expenses` array, same amounts, all
  -- submitted by v_pm (Thomas Meier) so you can also test
  -- project_manager's narrower RLS scope by logging in as him.
  --
  -- Statuses/approvers below reflect the CURRENT routing model
  -- (approval_routing.md, 2026-09-05), not the original mock fixture's
  -- statuses — 'finance_approval' no longer exists as a valid status.
  -- Thomas Meier's approval_limit is 500 (see users block above), so:
  --   142.50 and 249.00 (<= 500)  -> accounting_approval, approver Sarah
  --   890.00            (> 500)   -> ceo_approval, approver Anna
  insert into public.expenses (
    id, expense_type, project_id, budget_line_id, cost_center_id, partner_id,
    amount, description, vendor_name, invoice_number, receipt_status,
    document_ref, submitted_by, assigned_approver, status, created_at
  ) values
    (gen_random_uuid(), 'standard', v_prj_bib, v_bl_3, v_cc_3200, null,
     142.5, 'Berlin Workshop Verpflegung', 'Café Kreuzberg', 'R-2024-8842', 'attached',
     '/receipts/EXP-9021-cafe-kreuzberg.pdf', v_pm, v_acc, 'accounting_approval', '2024-10-12T09:12:00Z'),

    (gen_random_uuid(), 'standard', v_prj_str, v_bl_7, v_cc_3100, null,
     249.0, 'Bahncard-Abonnement 2024', 'Deutsche Bahn AG', 'BC-24-887', 'attached',
     '/receipts/EXP-9020-bahncard.pdf', v_pm, v_acc, 'accounting_approval', '2024-10-10T11:00:00Z'),

    (gen_random_uuid(), 'standard', v_prj_bib, v_bl_1, v_cc_1001, null,
     890.0, 'Büromiete November', 'Immobilien Nord', 'IN-11-2024', 'attached',
     '/receipts/EXP-9015-miete-11.pdf', v_pm, v_ceo, 'ceo_approval', '2024-10-05T14:20:00Z'),

    (gen_random_uuid(), 'standard', v_prj_bib, v_bl_2, v_cc_2001, null,
     2400.0, 'Partnerabrechnung Sportfonds', 'Sportfonds Neukölln', 'SF-24-33', 'missing',
     null, v_pm, v_pm, 'needs_changes', '2024-10-01T09:00:00Z'),

    (gen_random_uuid(), 'partner_advance', v_prj_int, v_bl_4, null, v_partner_lernhaus,
     5000.0, 'Vorschuss Lernhaus Q4', null, null, 'not_required',
     null, v_pm, v_acc, 'submitted_unverified', '2024-09-28T10:00:00Z'),

    (gen_random_uuid(), 'partner_advance', v_prj_int, v_bl_4, null, v_partner_kulturfonds,
     3200.0, 'Vorschuss Kulturfonds Q4', null, null, 'not_required',
     null, v_pm, v_acc, 'submitted_unverified', '2024-10-02T10:00:00Z'),

    (gen_random_uuid(), 'standard', v_prj_str, v_bl_6, v_cc_4100, null,
     1240.0, 'Honorar Fachvortrag', 'Dr. K. Böhm', 'H-24-11', 'attached',
     '/receipts/EXP-9005-honorar.pdf', v_pm, v_acc, 'awaiting_payment', '2024-09-20T09:00:00Z'),

    (gen_random_uuid(), 'standard', v_prj_bib, v_bl_1, v_cc_1002, null,
     640.0, 'Honorar Elternworkshop', 'M. Alwan', 'AW-24-04', 'attached',
     '/receipts/EXP-8990-honorar.pdf', v_pm, null, 'paid', '2024-09-02T08:30:00Z');

end $$;

commit;

-- =========================================================================
-- Verify (updated for the current routing model — Finance Manager has no
-- approval role at all, Accounting is the universal final approver):
--
-- As Sarah Weber (accounting), Übersicht should show 2 pending cards
-- (EXP-9021 Café Kreuzberg, EXP-9020 Bahncard — both assigned_approver =
-- v_acc, status accounting_approval).
--
-- As Anna Krüger (ceo), Übersicht should show 1 pending card (EXP-9015
-- Büromiete November — the only expense over Thomas's 500 EUR limit).
--
-- As Marcus Chen (finance_manager), Übersicht should show ZERO pending
-- approval cards — confirms Finance Manager genuinely has no approval
-- role under the current model, not just an empty queue by coincidence.
--
-- Budget-Status should read Bildungsinitiative Berlin Ist 640,00 € /
-- Obligo 1.032,50 €, Integration Neukölln Ist 0,00 € / Obligo 8.200,00 €,
-- Strukturförderung 2024 Ist 1.240,00 € / Obligo 249,00 € — matching the
-- mock UI exactly, since the numbers above were derived from it.
--
-- As Thomas Meier (project_manager), Übersicht's expense table should show
-- only his 8 own submissions (all of them, since he submitted every row
-- here) with the RLS policy in force — logging in as anyone who did NOT
-- submit any of these rows and does not lead a project any of them belong
-- to would show zero.
-- =========================================================================
