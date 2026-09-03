import { createBrowserClient } from "@supabase/ssr";

// TODO: once src/lib/supabase/database.types.ts exists (see that file's
// header for the generation command), parametrize as
// createBrowserClient<Database>(...) so query results are typed.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
