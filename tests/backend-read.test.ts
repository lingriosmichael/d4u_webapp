import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// getFromBackend runs in the authenticated layout on every page, so an
// unreachable backend must fall back to null instead of throwing into
// error.tsx.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getSession: async () => ({
        data: { session: { access_token: "test-access-token" } },
      }),
    },
  }),
}));

import { getFromBackend } from "@/lib/supabase/queries/backend-read";

const originalBackendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL;

beforeEach(() => {
  process.env.NEXT_PUBLIC_BACKEND_API_URL = "https://backend.example";
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.env.NEXT_PUBLIC_BACKEND_API_URL = originalBackendUrl;
  vi.restoreAllMocks();
});

describe("getFromBackend", () => {
  it("returns the response's data field on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { approve: true } }), { status: 200 }),
    );
    await expect(getFromBackend("/api/x")).resolves.toEqual({ approve: true });
  });

  it("returns null when the backend refuses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 403 }));
    await expect(getFromBackend("/api/x")).resolves.toBeNull();
  });

  it("returns null instead of throwing when the backend is unreachable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed"));
    await expect(getFromBackend("/api/x")).resolves.toBeNull();
  });

  it("returns null instead of throwing when the request times out", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new DOMException("The operation was aborted due to timeout", "TimeoutError"),
    );
    await expect(getFromBackend("/api/x")).resolves.toBeNull();
  });

  it("sends the session token and a timeout signal", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ data: null }), { status: 200 }));
    await getFromBackend("/api/x");
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://backend.example/api/x");
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer test-access-token",
    );
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});
