import type { ExpenseStatus, Role } from "@/lib/mock-data";

// Which role reviews an expense at each approval-stage status. Mirrors
// d4u_backend's state-machine.ts APPROVAL_STAGE_ROLE exactly — that map is
// the backend's real authorization rule for approve/reject, so it's the one
// source of truth for "can this person act on this expense right now."
//
// This is deliberately NOT based on expenses.assigned_approver: verified
// against the live backend that no route ever writes that column (only the
// original seed fixture did, once, for its own rows) — filtering on it here
// would silently hide every expense submitted through the real app from its
// reviewer's "needs action" list and action panel. Role + status is what
// the backend actually checks, so it's what the frontend must match too.
// "finance_approval" removed 2026-09-05 (documentation/approval_routing.md,
// backend: d4u_backend/src/lib/state-machine.ts) — Finance Manager has no
// approval role under the new model; Accounting is the universal final
// approver, CEO reviews first only when the submitter's approval_limit is
// exceeded.
export const APPROVAL_STAGE_ROLE: Partial<Record<ExpenseStatus, Role>> = {
  ceo_approval: "ceo",
  accounting_approval: "accounting",
};

export function isApprovalStageReviewer(status: ExpenseStatus, role: Role): boolean {
  return APPROVAL_STAGE_ROLE[status] === role;
}

// Display-only "whose court is the ball in" for a status, broader than
// APPROVAL_STAGE_ROLE above: it also covers advance verification and
// payment execution (accounting), and the submitter's own needs_changes
// turn — neither of which is an "approve/reject" action, so they don't
// belong in the authorization map. Used by Auswertung's expense overview
// (Zuständigkeit column/filter); never for gating an actual write.
export type ResponsibleParty = "ceo" | "accounting" | "submitter";

const STATUSES_BY_RESPONSIBLE_PARTY: Record<ResponsibleParty, ExpenseStatus[]> = {
  ceo: ["ceo_approval"],
  accounting: ["accounting_approval", "awaiting_payment", "submitted_unverified"],
  submitter: ["needs_changes"],
};

export function responsiblePartyForStatus(status: ExpenseStatus): ResponsibleParty | null {
  return (
    (Object.keys(STATUSES_BY_RESPONSIBLE_PARTY) as ResponsibleParty[]).find((party) =>
      STATUSES_BY_RESPONSIBLE_PARTY[party].includes(status),
    ) ?? null
  );
}

export function statusesForResponsibleParty(party: ResponsibleParty): ExpenseStatus[] {
  return STATUSES_BY_RESPONSIBLE_PARTY[party];
}
