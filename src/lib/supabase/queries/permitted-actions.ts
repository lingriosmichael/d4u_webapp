import "server-only";
import { getFromBackend } from "./backend-read";

// Server-side counterpart to lib/api.ts's callBackend — fetches which
// actions the CURRENT user may take on THIS expense from the backend's
// GET /api/expenses/:id/permitted-actions (see that route and
// state-machine.ts's getPermittedActions), rather than recomputing
// role+status locally. This is what expense-detail-view.tsx renders its
// action panel from now — see QA inventory §7 finding #1 for why
// that mattered.
export interface PermittedActions {
  approve: boolean;
  reject: boolean;
  resubmit: boolean;
  markPaid: boolean;
  undoApproval: boolean;
  reassignRequest: boolean;
  reassignApprove: boolean;
  reassignReject: boolean;
  documentsReceived: boolean;
  editAccountingNote: boolean;
  correctPaidExpense: boolean;
  addReceipt: boolean;
}

const ALL_FALSE: PermittedActions = {
  approve: false,
  reject: false,
  resubmit: false,
  markPaid: false,
  undoApproval: false,
  reassignRequest: false,
  reassignApprove: false,
  reassignReject: false,
  documentsReceived: false,
  editAccountingNote: false,
  correctPaidExpense: false,
  addReceipt: false,
};

export async function getPermittedActions(expenseId: string): Promise<PermittedActions> {
  const actions = await getFromBackend<PermittedActions>(
    `/api/expenses/${expenseId}/permitted-actions`,
  );
  return actions ?? ALL_FALSE;
}
