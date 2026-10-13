import "server-only";
import { getFromBackend } from "./backend-read";

// Open Umwidmung proposals, as the backend defines them (d4u_backend
// src/lib/reassignment-proposals.ts, migration 0028): the proposer's chosen
// destination, waiting for Accounting to approve or reject it. Read from the
// backend rather than approval_logs directly, so "open" has one definition.

export interface ReassignmentProposal {
  proposalId: string;
  expenseId: string;
  proposedBy: string;
  proposedAt: string;
  destination: {
    projectId: string;
    budgetLineId: string;
    costCenterId: string;
  };
}

export async function getOpenReassignmentProposal(
  expenseId: string,
): Promise<ReassignmentProposal | null> {
  return getFromBackend<ReassignmentProposal>(`/api/expenses/${expenseId}/reassign/proposal`);
}

/** Accounting's queue. Empty for every other role (the backend refuses them). */
export async function getOpenReassignmentProposals(): Promise<ReassignmentProposal[]> {
  return (await getFromBackend<ReassignmentProposal[]>(`/api/reassignment-proposals`)) ?? [];
}
