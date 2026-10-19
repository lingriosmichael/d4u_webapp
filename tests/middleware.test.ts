import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The middleware is the first of two independent login gates (the
// authenticated layout redirects too). Pinned: a visitor without a session
// is sent to /login from every other page, /login itself stays reachable,
// a signed-in user passes through, and a session Supabase refreshed during
// getUser() reaches both the rest of this request and the browser.

interface CookieToSet {
  name: string;
  value: string;
  options?: Record<string, unknown>;
}

interface CookieAdapter {
  getAll(): Array<{ name: string; value: string }>;
  setAll(cookies: CookieToSet[]): void;
}

const ssr = vi.hoisted(() => ({
  user: null as { id: string } | null,
  refreshedCookies: [] as CookieToSet[],
  createServerClient: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({ createServerClient: ssr.createServerClient }));

const { updateSession } = await import("@/lib/supabase/middleware");

const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.example";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  ssr.user = null;
  ssr.refreshedCookies = [];
  ssr.createServerClient.mockReset();
  ssr.createServerClient.mockImplementation(
    (_url: string, _key: string, options: { cookies: CookieAdapter }) => ({
      auth: {
        // Supabase writes refreshed tokens through setAll while it resolves getUser().
        getUser: async () => {
          if (ssr.refreshedCookies.length) options.cookies.setAll(ssr.refreshedCookies);
          return { data: { user: ssr.user } };
        },
      },
    }),
  );
});

afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey;
});

function request(path: string, cookie?: string) {
  return new NextRequest(`https://finance.d4u.example${path}`, {
    headers: cookie ? { cookie } : {},
  });
}

function isRedirectToLogin(response: Response) {
  return (
    response.status === 307 &&
    new URL(response.headers.get("location") ?? "", "https://x.example").pathname === "/login"
  );
}

describe("updateSession", () => {
  it.each(["/", "/expenses/7bf3f03a", "/visualization/export", "/admin", "/password-aendern"])(
    "sends a visitor without a session from %s to /login",
    async (path) => {
      const response = await updateSession(request(path));
      expect(isRedirectToLogin(response)).toBe(true);
    },
  );

  it("keeps the redirect on the same origin", async () => {
    const response = await updateSession(request("/visualization"));
    expect(new URL(response.headers.get("location")!).origin).toBe("https://finance.d4u.example");
  });

  it("does not redirect /login itself, so there is no redirect loop", async () => {
    const response = await updateSession(request("/login"));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("lets a signed-in user through to the page they asked for", async () => {
    ssr.user = { id: "user-1" };
    const response = await updateSession(request("/visualization"));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("checks the session with getUser() against the configured project, reading the request's cookies", async () => {
    ssr.user = { id: "user-1" };
    await updateSession(request("/", "sb-access-token=abc"));

    expect(ssr.createServerClient).toHaveBeenCalledWith(
      "https://project.supabase.example",
      "anon-key",
      expect.anything(),
    );
    const { cookies } = ssr.createServerClient.mock.calls[0][2] as { cookies: CookieAdapter };
    expect(cookies.getAll()).toEqual([{ name: "sb-access-token", value: "abc" }]);
  });

  it("passes a refreshed session cookie on to the browser and to the rest of the request", async () => {
    ssr.user = { id: "user-1" };
    ssr.refreshedCookies = [
      { name: "sb-access-token", value: "refreshed", options: { path: "/", httpOnly: true } },
    ];

    const response = await updateSession(request("/", "sb-access-token=expiring"));

    expect(response.cookies.get("sb-access-token")?.value).toBe("refreshed");
    expect(response.headers.get("set-cookie")).toContain("sb-access-token=refreshed");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    // Server components further down read the request's cookies, so the
    // forwarded request must carry the new token as well.
    expect(response.headers.get("x-middleware-request-cookie")).toContain(
      "sb-access-token=refreshed",
    );
  });

  it("still redirects when the refresh fails and leaves no user", async () => {
    ssr.refreshedCookies = [{ name: "sb-access-token", value: "", options: { maxAge: 0 } }];
    const response = await updateSession(request("/admin", "sb-access-token=revoked"));
    expect(isRedirectToLogin(response)).toBe(true);
  });
});
