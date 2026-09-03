import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Anmelden — D4U Finance",
  robots: { index: false, follow: false },
};

// Deliberately minimal: still renders inside the main AppShell sidebar for
// now (no route-group split yet) since nothing gates access to other routes
// until Phase 3 wires real session checks in place of the fake role
// switcher. Splitting this into its own layout is a follow-up, not skipped
// by accident.
export default function LoginPage() {
  return (
    <div className="flex min-h-[calc(100vh-0px)] items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <h1 className="font-heading text-xl font-semibold text-foreground mb-1">Anmelden</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Melden Sie sich mit Ihrem D4U-Konto an.
        </p>
        <LoginForm />
      </div>
    </div>
  );
}
