import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Server-side GET against d4u_backend with the current session's token —
 * the read-side counterpart to lib/api.ts's callBackend, for data only the
 * backend can answer (what the user may do, open Umwidmung proposals).
 * Returns the response's `data` field, or null when there is no session,
 * the backend refuses, or it cannot be reached in time; callers choose their
 * own safe fallback. Never throws for an unreachable backend: the
 * authenticated layout calls this on every page, so a slow or cold backend
 * must degrade to the fallback rather than render the error page.
 */
const BACKEND_READ_TIMEOUT_MS = 5000;

export async function getFromBackend<T>(path: string): Promise<T | null> {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL;
  if (!backendUrl) throw new Error("NEXT_PUBLIC_BACKEND_API_URL ist nicht gesetzt.");

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;

  let response: Response;
  try {
    response = await fetch(`${backendUrl}${path}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(BACKEND_READ_TIMEOUT_MS),
    });
  } catch (error) {
    console.error(`Backend read failed: GET ${path}`, error);
    return null;
  }
  if (!response.ok) return null;

  const body = await response.json().catch(() => null);
  return (body?.data as T | undefined) ?? null;
}
