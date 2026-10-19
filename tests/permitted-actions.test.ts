import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Expense Detail action panel renders exactly what
// GET /api/expenses/:id/permitted-actions allows (CONTRIBUTING: "If the
// backend didn't authorize an action, don't render it"). Pinned: anything
// short of a clean answer from the backend — no session, unreachable,
// refused, unreadable — renders no action at all. The backend re-checks
// every write anyway; this keeps the UI from offering what it can't do.
// Tested through the real getFromBackend, with only fetch and the session
// stubbed, so the whole fail-closed chain is covered.

const session = vi.hoisted(() => ({ current: { access_token: "test-access-token" } as unknown }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getSession: async () => ({ data: { session: session.current } }) },
  }),
}));

const { getPermittedActions } = await import("@/lib/supabase/queries/permitted-actions");
type PermittedActions = Awaited<ReturnType<typeof getPermittedActions>>;

const ACTION_NAMES: Array<keyof PermittedActions> = [
  "approve",
  "reject",
  "resubmit",
  "markPaid",
  "undoApproval",
  "reassignRequest",
  "reassignApprove",
  "reassignReject",
  "documentsReceived",
  "editAccountingNote",
  "correctPaidExpense",
];

const NOTHING_PERMITTED = Object.fromEntries(ACTION_NAMES.map((name) => [name, false]));

const originalBackendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL;

beforeEach(() => {
  process.env.NEXT_PUBLIC_BACKEND_API_URL = "https://backend.example";
  session.current = { access_token: "test-access-token" };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.env.NEXT_PUBLIC_BACKEND_API_URL = originalBackendUrl;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubFetch(response: Partial<Response> | Error) {
  const fetchMock =
    response instanceof Error
      ? vi.fn().mockRejectedValue(response)
      : vi.fn().mockResolvedValue({ ok: true, status: 200, ...response });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function respondWith(body: unknown) {
  return stubFetch({ json: async () => body });
}

/** What the action panel acts on: an action renders when its flag is truthy. */
function renderedActions(actions: PermittedActions) {
  return ACTION_NAMES.filter((name) =>
    Boolean((actions as unknown as Record<string, unknown>)[name]),
  );
}

describe("getPermittedActions", () => {
  it("asks the backend about this expense, with the user's token", async () => {
    const fetchMock = respondWith({ data: { ...NOTHING_PERMITTED, approve: true } });

    await getPermittedActions("7bf3f03a");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://backend.example/api/expenses/7bf3f03a/permitted-actions",
      expect.objectContaining({
        headers: { Authorization: "Bearer test-access-token" },
        cache: "no-store",
      }),
    );
  });

  it("passes the backend's answer through unchanged", async () => {
    const answer = { ...NOTHING_PERMITTED, markPaid: true, editAccountingNote: true };
    respondWith({ data: answer });

    expect(await getPermittedActions("e1")).toEqual(answer);
  });

  it("permits nothing without a session, and doesn't call the backend", async () => {
    session.current = null;
    const fetchMock = respondWith({ data: { ...NOTHING_PERMITTED, approve: true } });

    expect(await getPermittedActions("e1")).toEqual(NOTHING_PERMITTED);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("permits nothing when the backend can't be reached or times out", async () => {
    stubFetch(new TypeError("fetch failed"));
    expect(await getPermittedActions("e1")).toEqual(NOTHING_PERMITTED);

    stubFetch(new DOMException("The operation timed out.", "TimeoutError"));
    expect(await getPermittedActions("e1")).toEqual(NOTHING_PERMITTED);
  });

  it.each([401, 403, 404, 500, 503])(
    "permits nothing when the backend answers %i",
    async (status) => {
      stubFetch({
        ok: false,
        status,
        json: async () => ({ data: { ...NOTHING_PERMITTED, approve: true } }),
      });
      expect(await getPermittedActions("e1")).toEqual(NOTHING_PERMITTED);
    },
  );

  it("permits nothing when the body isn't JSON", async () => {
    stubFetch({
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    });
    expect(await getPermittedActions("e1")).toEqual(NOTHING_PERMITTED);
  });

  it.each([
    ["an empty body", {}],
    ["a null body", null],
    ["data: null", { data: null }],
    ["an error envelope", { error: { code: "D4001", message: "Kein Zugriff" } }],
  ])("permits nothing for %s", async (_label, body) => {
    respondWith(body);
    expect(await getPermittedActions("e1")).toEqual(NOTHING_PERMITTED);
  });

  it.each([
    ["a string", "approve"],
    ["an array", ["approve", "markPaid"]],
    ["a number", 1],
    ["true", true],
  ])("renders no action when data is %s", async (_label, data) => {
    respondWith({ data });
    expect(renderedActions(await getPermittedActions("e1"))).toEqual([]);
  });

  it("renders only the actions an incomplete answer names", async () => {
    respondWith({ data: { approve: true } });
    expect(renderedActions(await getPermittedActions("e1"))).toEqual(["approve"]);
  });

  // KNOWN BUG: permitted-actions.ts:40-43 returns the backend's `data`
  // without checking it, and the action panel tests each flag for
  // truthiness (expense-detail-view.tsx), so a malformed answer such as
  // "false" or 1 renders that action. Only a literal `true` should count.
  // The backend still refuses the write; the bug is a button that
  // shouldn't be there.
  it.fails("counts only a literal true as permission", async () => {
    respondWith({ data: { ...NOTHING_PERMITTED, approve: "false", markPaid: 1 } });
    expect(renderedActions(await getPermittedActions("e1"))).toEqual([]);
  });
});
