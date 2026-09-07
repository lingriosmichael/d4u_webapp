import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// resolveRoute (the dot-namespaced endpoint -> backend REST route table) is
// not exported -- deliberately, per api.ts's own comment, it's an internal
// reconciliation table for callBackend's one public contract. Testing it
// through callBackend exercises the actual thing every screen calls, and
// catches the exact class of mistake that matters here: a wrong method or
// path for one of this session's own new endpoints (advances.split,
// expenses.attachReceipt, advances.submitForReconciliation).

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({
        data: { session: { access_token: "test-access-token" } },
      }),
    },
  }),
}));

const originalBackendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL;

beforeEach(() => {
  process.env.NEXT_PUBLIC_BACKEND_API_URL = "https://backend.example";
  vi.restoreAllMocks();
});

afterEach(() => {
  process.env.NEXT_PUBLIC_BACKEND_API_URL = originalBackendUrl;
});

function mockFetchOk(body: unknown = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => body,
    }),
  );
}

describe("callBackend route resolution", () => {
  it.each([
    ["expenses.create", { amount: 10 }, "POST", "/api/expenses"],
    ["expenses.approve", { expenseId: "e1" }, "POST", "/api/expenses/e1/approve"],
    ["expenses.requestChanges", { expenseId: "e1" }, "POST", "/api/expenses/e1/reject"],
    ["expenses.markPaid", { expenseId: "e1" }, "POST", "/api/expenses/e1/mark-paid"],
    ["expenses.undoApproval", { expenseId: "e1" }, "POST", "/api/expenses/e1/undo-approval"],
    ["expenses.reconcile", { expenseId: "e1" }, "POST", "/api/advances/e1/reconcile/commit"],
    ["expenses.reassign", { expenseId: "e1" }, "POST", "/api/expenses/e1/reassign/request"],
    ["expenses.reassignApprove", { expenseId: "e1" }, "POST", "/api/expenses/e1/reassign/approve"],
    ["expenses.attachReceipt", { expenseId: "c1" }, "POST", "/api/expenses/c1/receipt"],
    ["advances.split", { expenseId: "a1" }, "POST", "/api/advances/a1/split"],
    [
      "advances.submitForReconciliation",
      { expenseId: "a1" },
      "POST",
      "/api/advances/a1/submit-for-reconciliation",
    ],
    ["admin.users.delete", { id: "u1" }, "DELETE", "/api/admin/users/u1"],
    ["admin.settings.update", {}, "PATCH", "/api/admin/settings"],
  ] as const)("%s -> %s %s", async (endpoint, payload, method, path) => {
    mockFetchOk();
    const { callBackend } = await import("@/lib/api");

    await callBackend(endpoint, payload);

    expect(fetch).toHaveBeenCalledWith(
      `https://backend.example${path}`,
      expect.objectContaining({ method }),
    );
  });

  it("upsert endpoints POST without an id and PATCH with one", async () => {
    mockFetchOk();
    const { callBackend } = await import("@/lib/api");

    await callBackend("admin.users.upsert", { name: "New" });
    expect(fetch).toHaveBeenLastCalledWith(
      "https://backend.example/api/admin/users",
      expect.objectContaining({ method: "POST" }),
    );

    await callBackend("admin.users.upsert", { id: "u1", name: "Existing" });
    expect(fetch).toHaveBeenLastCalledWith(
      "https://backend.example/api/admin/users/u1",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("group membership resolves to POST for add and DELETE for remove", async () => {
    mockFetchOk();
    const { callBackend } = await import("@/lib/api");

    await callBackend("admin.groups.setMembership", { groupId: "g1", action: "add" });
    expect(fetch).toHaveBeenLastCalledWith(
      "https://backend.example/api/admin/groups/g1/membership",
      expect.objectContaining({ method: "POST" }),
    );

    await callBackend("admin.groups.setMembership", { groupId: "g1", action: "remove" });
    expect(fetch).toHaveBeenLastCalledWith(
      "https://backend.example/api/admin/groups/g1/membership",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("attaches the session's bearer token", async () => {
    mockFetchOk();
    const { callBackend } = await import("@/lib/api");

    await callBackend("expenses.create", {});

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-access-token" }),
      }),
    );
  });

  it("throws when NEXT_PUBLIC_BACKEND_API_URL is unset", async () => {
    delete process.env.NEXT_PUBLIC_BACKEND_API_URL;
    const { callBackend } = await import("@/lib/api");

    await expect(callBackend("expenses.create", {})).rejects.toThrow("NEXT_PUBLIC_BACKEND_API_URL");
  });
});

describe("BackendError / backendErrorMessage", () => {
  it("surfaces the backend's own (already German, user-safe) message on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ error: "Dieser Beleg wurde bereits bearbeitet.", code: "conflict" }),
      }),
    );
    const { callBackend, BackendError } = await import("@/lib/api");

    await expect(callBackend("expenses.approve", { expenseId: "e1" })).rejects.toMatchObject({
      message: "Dieser Beleg wurde bereits bearbeitet.",
      status: 409,
    });

    try {
      await callBackend("expenses.approve", { expenseId: "e1" });
    } catch (error) {
      expect(error).toBeInstanceOf(BackendError);
    }
  });

  it("never surfaces internals for a non-BackendError failure (network error, unexpected shape)", async () => {
    const { backendErrorMessage } = await import("@/lib/api");

    const message = backendErrorMessage(new TypeError("Failed to fetch"));

    expect(message).toBe(
      "Die Aktion konnte nicht ausgeführt werden. Bitte versuchen Sie es erneut.",
    );
    expect(message).not.toContain("TypeError");
    expect(message).not.toContain("fetch");
  });

  it("passes a BackendError's own message through unchanged", async () => {
    const { backendErrorMessage, BackendError } = await import("@/lib/api");

    const message = backendErrorMessage(new BackendError("Nicht angemeldet.", 401));

    expect(message).toBe("Nicht angemeldet.");
  });
});
