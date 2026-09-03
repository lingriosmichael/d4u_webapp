-- =========================================================================
-- D4U Finance — Row Level Security policies
-- =========================================================================
-- Run via Supabase CLI as a migration:
--   supabase migration new rls_policies
--   (paste this file's contents into the generated file)
--   supabase db push        -- or supabase db reset locally first
--
-- Do NOT paste this directly into the Supabase dashboard SQL editor for
-- Staging/Production — see root CLAUDE.md and implementation doc §25 for
-- the migration convention (versioned, checked into the repo, append-only).
--
-- DESIGN NOTE — why there are no INSERT/UPDATE/DELETE policies below:
-- All business writes go through the backend using the Supabase
-- service-role key, which bypasses RLS entirely by design. Once RLS is
-- enabled on a table with only SELECT policies defined, writes from the
-- `authenticated` role are denied by default (no matching policy = deny).
-- That implicit deny IS the enforcement of "frontend never writes
-- business-critical data directly" — it does not need a separate policy.
--
-- KNOWN GAP — Project Manager project-scoping:
-- There is no `project_members` table yet (implementation doc §20,
-- BLOCKER: "How are Project Managers assigned to their own projects?").
-- Until that exists, Project Manager is scoped to `submitted_by =
-- auth.uid()` on expenses/approval_logs below — a deliberately
-- conservative interim default (least privilege), not a guess at the
-- real business rule. Revisit once project_members lands; the intended
-- end state is probably "PM sees expenses for projects they're a member
-- of," which this is not yet.
-- =========================================================================


-- -------------------------------------------------------------------------
-- Helper functions
-- -------------------------------------------------------------------------
-- SECURITY DEFINER so these can read public.users without recursing into
-- RLS on public.users itself (a policy on `users` that calls a normal
-- function which selects from `users` would deadlock/recurse).

create or replace function public.current_user_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.users where id = auth.uid();
$$;

create or replace function public.current_user_is_active()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select active from public.users where id = auth.uid()), false);
$$;

-- Org-wide read visibility per the confirmed role model (§2): finance_manager,
-- accounting, ceo, and admin all get org-wide visualization. project_manager
-- is deliberately excluded here — see KNOWN GAP note above.
create or replace function public.is_org_wide_reader()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.current_user_is_active()
     and public.current_user_role() in ('finance_manager', 'accounting', 'ceo', 'admin');
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.current_user_is_active()
     and public.current_user_role() = 'admin';
$$;

create or replace function public.is_accounting_or_above()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.current_user_is_active()
     and public.current_user_role() in ('accounting', 'ceo', 'admin');
$$;


-- -------------------------------------------------------------------------
-- users
-- -------------------------------------------------------------------------
alter table public.users enable row level security;

-- Everyone (active) can read their own row.
create policy "users_select_own"
on public.users for select
to authenticated
using (id = auth.uid());

-- Admin can read every user row (needed for the Verwaltung/Nutzer tab).
create policy "users_select_admin"
on public.users for select
to authenticated
using (public.is_admin());


-- -------------------------------------------------------------------------
-- partners
-- -------------------------------------------------------------------------
alter table public.partners enable row level security;

-- All active users can read partners (needed for the partner-advance
-- dropdown on Beleg-Upload). No sensitive financial data lives here.
create policy "partners_select_active_users"
on public.partners for select
to authenticated
using (public.current_user_is_active());


-- -------------------------------------------------------------------------
-- projects
-- -------------------------------------------------------------------------
alter table public.projects enable row level security;

-- All active users can read all projects for now. This is intentionally
-- broad, matching the current schema's inability to scope by membership
-- (no project_members table — see KNOWN GAP). Tighten once that exists.
create policy "projects_select_active_users"
on public.projects for select
to authenticated
using (public.current_user_is_active());


-- -------------------------------------------------------------------------
-- cost_centers
-- -------------------------------------------------------------------------
alter table public.cost_centers enable row level security;

create policy "cost_centers_select_active_users"
on public.cost_centers for select
to authenticated
using (public.current_user_is_active());


-- -------------------------------------------------------------------------
-- cost_center_groups
-- -------------------------------------------------------------------------
alter table public.cost_center_groups enable row level security;

create policy "cost_center_groups_select_active_users"
on public.cost_center_groups for select
to authenticated
using (public.current_user_is_active());


-- -------------------------------------------------------------------------
-- cost_center_group_members
-- -------------------------------------------------------------------------
alter table public.cost_center_group_members enable row level security;

create policy "cost_center_group_members_select_active_users"
on public.cost_center_group_members for select
to authenticated
using (public.current_user_is_active());


-- -------------------------------------------------------------------------
-- budget_lines
-- -------------------------------------------------------------------------
alter table public.budget_lines enable row level security;

-- Needed by every role for the Auswertung dashboard (Soll/Ist/Obligo) and
-- for validating cost-center/budget-line combinations on submission.
create policy "budget_lines_select_active_users"
on public.budget_lines for select
to authenticated
using (public.current_user_is_active());


-- -------------------------------------------------------------------------
-- expenses  (the sensitive one — see KNOWN GAP note above)
-- -------------------------------------------------------------------------
alter table public.expenses enable row level security;

-- Org-wide roles (finance_manager, accounting, ceo, admin) see everything.
create policy "expenses_select_org_wide"
on public.expenses for select
to authenticated
using (public.is_org_wide_reader());

-- Project Manager (and any other non-org-wide, active role) sees only
-- expenses they personally submitted, until project_members exists.
create policy "expenses_select_own_submissions"
on public.expenses for select
to authenticated
using (
  public.current_user_is_active()
  and submitted_by = auth.uid()
);


-- -------------------------------------------------------------------------
-- expense_accounting_details
-- -------------------------------------------------------------------------
alter table public.expense_accounting_details enable row level security;

-- Back-office bookkeeping fields (VAT, supplier bank, etc.) — restricted
-- to accounting/ceo/admin, not exposed org-wide to Finance Manager and
-- not exposed to the original submitter.
create policy "expense_accounting_details_select_accounting"
on public.expense_accounting_details for select
to authenticated
using (public.is_accounting_or_above());


-- -------------------------------------------------------------------------
-- approval_logs
-- -------------------------------------------------------------------------
alter table public.approval_logs enable row level security;

create policy "approval_logs_select_org_wide"
on public.approval_logs for select
to authenticated
using (public.is_org_wide_reader());

-- Same interim scoping as expenses: visibility follows the parent
-- expense's submitter until project_members exists.
create policy "approval_logs_select_own_submissions"
on public.approval_logs for select
to authenticated
using (
  public.current_user_is_active()
  and exists (
    select 1 from public.expenses e
    where e.id = approval_logs.expense_id
      and e.submitted_by = auth.uid()
  )
);


-- -------------------------------------------------------------------------
-- admin_audit_log
-- -------------------------------------------------------------------------
alter table public.admin_audit_log enable row level security;

-- Admin only. This is the one confirmed as a truly org-internal
-- surface, not something to expose to Finance Manager/Accounting/CEO.
create policy "admin_audit_log_select_admin"
on public.admin_audit_log for select
to authenticated
using (public.is_admin());


-- -------------------------------------------------------------------------
-- settings
-- -------------------------------------------------------------------------
alter table public.settings enable row level security;

-- Readable by all active users — the frontend needs values like
-- advance_requires_ceo_approval and the (still-unconfirmed) approval
-- threshold to render correctly.
create policy "settings_select_active_users"
on public.settings for select
to authenticated
using (public.current_user_is_active());

-- =========================================================================
-- NOT covered by this migration — separate concerns:
--   - Supabase Storage bucket policies for the private `receipts` bucket
--     (these are storage.objects policies, not table RLS; needed before
--     frontend upload/download of receipts works under RLS).
--   - Any INSERT/UPDATE/DELETE policy for any role. None should be added
--     for `authenticated` on any table above — all writes go through the
--     backend's service-role connection, which bypasses RLS by design.
-- =========================================================================
