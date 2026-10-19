import { describe, expect, it, vi } from "vitest";
import type { ExpenseStatus, Role } from "@/lib/mock-data";
import type { DashboardExpense } from "@/lib/supabase/queries/dashboard";

// Übersicht's "Offene Aufgaben" and the sidebar count. Regression (reported
// 19 Oct 2026): a sent-back expense never showed up for its submitter, for
// any role, since the list only matched status against the reviewer role.
// The backend lets exactly the submitter resubmit, whatever their role
// (d4u_backend state-machine.ts, handleResubmit), so that's who sees it.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const { needsActionFor } = await import("@/lib/supabase/queries/dashboard");

const ALL_ROLES: Role[] = ["project_manager", "finance_manager", "accounting", "ceo", "admin"];

function expense(overrides: Partial<DashboardExpense>): DashboardExpense {
  return {
    id: "expense-1",
    projectId: "project-1",
    amount: 120,
    description: "Bahnticket",
    status: "accounting_approval",
    createdAt: "2026-10-19T10:01:17Z",
    submittedBy: "submitter",
    submittedByName: "David Kirchner",
    partnerId: null,
    partnerName: null,
    ...overrides,
  };
}

function idsFor(
  expenses: DashboardExpense[],
  user: { id: string; role: Role },
  open = new Set<string>(),
) {
  return needsActionFor(expenses, user, open).map((e) => e.id);
}

describe("needsActionFor: sent-back expenses", () => {
  it.each(ALL_ROLES)("shows a %s their own sent-back expense", (role) => {
    const sentBack = expense({ status: "needs_changes", submittedBy: "me" });
    expect(idsFor([sentBack], { id: "me", role })).toEqual([sentBack.id]);
  });

  it.each(ALL_ROLES)("doesn't show a %s someone else's sent-back expense", (role) => {
    const sentBack = expense({ status: "needs_changes", submittedBy: "someone-else" });
    expect(idsFor([sentBack], { id: "me", role })).toEqual([]);
  });
});

describe("needsActionFor: reviewer rules unchanged", () => {
  const reviewCases: { status: ExpenseStatus; reviewer: Role }[] = [
    { status: "ceo_approval", reviewer: "ceo" },
    { status: "accounting_approval", reviewer: "accounting" },
    { status: "submitted_unverified", reviewer: "accounting" },
  ];

  it.each(reviewCases)("$status is a task for $reviewer only", ({ status, reviewer }) => {
    const pending = expense({ status });
    for (const role of ALL_ROLES) {
      expect(idsFor([pending], { id: "me", role })).toEqual(role === reviewer ? [pending.id] : []);
    }
  });

  it("an open Umwidmung proposal is a task for Accounting only", () => {
    const paid = expense({ status: "paid" });
    const open = new Set([paid.id]);
    for (const role of ALL_ROLES) {
      expect(idsFor([paid], { id: "me", role }, open)).toEqual(
        role === "accounting" ? [paid.id] : [],
      );
    }
  });

  it.each(["awaiting_payment", "paid"] as ExpenseStatus[])(
    "%s is nobody's task, not even the submitter's",
    (status) => {
      const done = expense({ status, submittedBy: "me" });
      for (const role of ALL_ROLES) {
        expect(idsFor([done], { id: "me", role })).toEqual([]);
      }
    },
  );
});
