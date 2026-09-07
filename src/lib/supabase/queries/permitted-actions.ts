import "server-only";
import { createClient } from "@/lib/supabase/server";

// Server-side counterpart to lib/api.ts's callBackend — fetches which
// actions the CURRENT user may take on THIS expense from the backend's
// GET /api/expenses/:id/permitted-actions (see that route and
// state-machine.ts's getPermittedActions), rather than recomputing
// role+status locally. This is what expense-detail-view.tsx renders its
// action panel from now — see test-run/INVENTORY.md §7 finding #1 for why
// that mattered.
export interface PermittedActions {
  approve: boolean;
  reject: boolean;
  resubmit: boolean;
  markPaid: boolean;
  undoApproval: boolean;
  reassignRequest: boolean;
  reassignApprove: boolean;
  documentsReceived: boolean;
}

const ALL_FALSE: PermittedActions = {
  approve: false,
  reject: false,
  resubmit: false,
  markPaid: false,
  undoApproval: false,
  reassignRequest: false,
  reassignApprove: false,
  documentsReceived: false,
};

export async function getPermittedActions(expenseId: string): Promise<PermittedActions> {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL;
  if (!backendUrl) throw new Error("NEXT_PUBLIC_BACKEND_API_URL ist nicht gesetzt.");

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return ALL_FALSE;

  const response = await fetch(`${backendUrl}/api/expenses/${expenseId}/permitted-actions`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: "no-store",
  });
  if (!response.ok) return ALL_FALSE;

  const body = await response.json().catch(() => null);
  return body?.data ?? ALL_FALSE;
}
