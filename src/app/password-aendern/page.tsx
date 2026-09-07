import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUserProfile, getMustChangePassword } from "@/lib/supabase/queries/current-user";
import { PasswordChangeForm } from "./password-change-form";

export const metadata: Metadata = {
  title: "Passwort ändern — D4U Finance",
  robots: { index: false, follow: false },
};

// Deliberately outside the (authenticated) route group — reachable for a
// user whose temporary password has not been changed yet.
// layout.tsx just redirected here, so it can't itself depend on that
// layout's gate. Still requires a real session (redirects to /login if
// none), and redirects home if the flag is already cleared — visiting this
// URL directly after already changing your password shouldn't be a dead end.
export default async function PasswordChangePage() {
  const user = await getCurrentUserProfile();
  if (!user) redirect("/login");
  if (!(await getMustChangePassword())) redirect("/");

  return (
    <div className="login-scope text-foreground relative flex min-h-[calc(100vh-0px)] items-center justify-center overflow-hidden px-4 py-16">
      <div className="relative w-full max-w-sm">
        <h1 className="font-heading text-[22px] leading-[1.3] font-medium text-sand mb-1">
          Passwort ändern
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          Ihr Konto wurde mit einem vorläufigen Passwort angelegt. Bitte vergeben Sie jetzt Ihr
          eigenes Passwort, um fortzufahren.
        </p>
        <PasswordChangeForm />
      </div>
    </div>
  );
}
