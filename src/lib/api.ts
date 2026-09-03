// Backend call stubs.
//
// Every write in this frontend (Freigaben, Zahlungen, Abrechnungen, Admin-Edits)
// goes through `callBackend`. Heute ist das ein Platzhalter — später wird hier
// der echte n8n-Webhook bzw. Supabase-RPC aufgerufen. Der Client mutiert
// bewusst keinen Zustand selbst und berechnet keine Finanzkennzahlen.

export type BackendEndpoint =
  | "expenses.approve"
  | "expenses.requestChanges"
  | "expenses.reject"
  | "expenses.markPaid"
  | "expenses.undoApproval"
  | "expenses.documentsReceived"
  | "expenses.reconcile"
  | "expenses.reassign"
  | "expenses.resubmit"
  | "admin.users.upsert"
  | "admin.users.setActive"
  | "admin.projects.upsert"
  | "admin.costCenters.upsert"
  | "admin.groups.upsert"
  | "admin.groups.setMembership"
  | "admin.budgets.upsert"
  | "admin.partners.upsert"
  | "admin.settings.update";

export interface BackendResult {
  ok: true;
  endpoint: BackendEndpoint;
}

/** Stub: simuliert den Aufruf des Backends und löst nach kurzer Latenz auf. */
export async function callBackend(
  endpoint: BackendEndpoint,
  payload: Record<string, unknown>,
): Promise<BackendResult> {
  // eslint-disable-next-line no-console
  console.info("[backend stub]", endpoint, payload);
  await new Promise((r) => setTimeout(r, 350));
  return { ok: true, endpoint };
}
