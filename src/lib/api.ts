"use client";

// Real backend calls. Every write in this frontend (Freigaben, Zahlungen,
// Abrechnungen, Admin-Edits) goes through `callBackend`, which attaches the
// current Supabase session's access token as a bearer token and calls
// NEXT_PUBLIC_BACKEND_API_URL — the d4u_backend repo, never Supabase
// directly for these. The client deliberately never mutates state itself
// and never computes financial figures; the backend's response is what the
// UI reflects.

import { createClient } from "./supabase/client";

export type BackendEndpoint =
  | "expenses.approve"
  | "expenses.requestChanges"
  | "expenses.reject"
  | "expenses.markPaid"
  | "expenses.undoApproval"
  | "expenses.documentsReceived"
  | "expenses.reconcile"
  | "expenses.reassign"
  | "expenses.reassignApprove"
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
  data?: unknown;
}

export class BackendError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "BackendError";
  }
}

// Maps this frontend's dot-namespaced endpoint names to the backend's REST
// routes (d4u_backend/src/app/api/**). These two naming schemes never got
// reconciled when the backend was built (flagged at the time, not silently
// picked) — this table is that reconciliation, in one place, rather than
// scattered across call sites.
//
// "expenses.reject" has no distinct backend route: the backend only
// implements one needs_changes-producing action (POST .../reject, which
// this frontend's UI actually calls "Korrektur anfordern" /
// requestChanges). No screen in this app currently calls "expenses.reject"
// — it's kept in the type for shape-compatibility but routes to the same
// place as requestChanges if anything ever does.
function resolveRoute(
  endpoint: BackendEndpoint,
  payload: Record<string, unknown>,
): { method: string; path: string } {
  const expenseId = payload.expenseId as string | undefined;
  const id = payload.id as string | undefined;

  switch (endpoint) {
    case "expenses.approve":
      return { method: "POST", path: `/api/expenses/${expenseId}/approve` };
    case "expenses.requestChanges":
    case "expenses.reject":
      return { method: "POST", path: `/api/expenses/${expenseId}/reject` };
    case "expenses.resubmit":
      return { method: "POST", path: `/api/expenses/${expenseId}/resubmit` };
    case "expenses.markPaid":
      return { method: "POST", path: `/api/expenses/${expenseId}/mark-paid` };
    case "expenses.undoApproval":
      return { method: "POST", path: `/api/expenses/${expenseId}/undo-approval` };
    case "expenses.documentsReceived":
      return { method: "POST", path: `/api/advances/${expenseId}/documents-received` };
    case "expenses.reconcile":
      return { method: "POST", path: `/api/advances/${expenseId}/reconcile/commit` };
    case "expenses.reassign":
      return { method: "POST", path: `/api/expenses/${expenseId}/reassign/request` };
    case "expenses.reassignApprove":
      return { method: "POST", path: `/api/expenses/${expenseId}/reassign/approve` };
    case "admin.users.upsert":
      return id
        ? { method: "PATCH", path: `/api/admin/users/${id}` }
        : { method: "POST", path: `/api/admin/users` };
    case "admin.users.setActive":
      return { method: "PATCH", path: `/api/admin/users/${id}` };
    case "admin.projects.upsert":
      return id
        ? { method: "PATCH", path: `/api/admin/projects/${id}` }
        : { method: "POST", path: `/api/admin/projects` };
    case "admin.costCenters.upsert":
      return id
        ? { method: "PATCH", path: `/api/admin/cost-centers/${id}` }
        : { method: "POST", path: `/api/admin/cost-centers` };
    case "admin.groups.upsert":
      return id
        ? { method: "PATCH", path: `/api/admin/groups/${id}` }
        : { method: "POST", path: `/api/admin/groups` };
    case "admin.groups.setMembership": {
      const action = payload.action === "remove" ? "DELETE" : "POST";
      return { method: action, path: `/api/admin/groups/${payload.groupId}/membership` };
    }
    case "admin.budgets.upsert":
      return id
        ? { method: "PATCH", path: `/api/admin/budget-lines/${id}` }
        : { method: "POST", path: `/api/admin/budget-lines` };
    case "admin.partners.upsert":
      return id
        ? { method: "PATCH", path: `/api/admin/partners/${id}` }
        : { method: "POST", path: `/api/admin/partners` };
    case "admin.settings.update":
      return { method: "PATCH", path: `/api/admin/settings` };
  }
}

async function getAccessToken(): Promise<string> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new BackendError("Nicht angemeldet.", 401);
  return session.access_token;
}

export async function callBackend(
  endpoint: BackendEndpoint,
  payload: Record<string, unknown>,
): Promise<BackendResult> {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL;
  if (!backendUrl) throw new Error("NEXT_PUBLIC_BACKEND_API_URL ist nicht gesetzt.");

  const token = await getAccessToken();
  const { method, path } = resolveRoute(endpoint, payload);

  const response = await fetch(`${backendUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: method === "GET" ? undefined : JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new BackendError(body.error ?? `Backend-Fehler (${response.status})`, response.status);
  }

  return { ok: true, endpoint, data: body };
}
