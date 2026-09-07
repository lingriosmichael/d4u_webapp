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
    <div className="login-scope text-foreground relative flex min-h-[calc(100vh-0px)] items-center justify-center overflow-hidden px-4 py-16">
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative background mark, not content; next/image's fixed-size sizing fights the 70vw fluid layout here */}
      <img
        src="/d4u-mark.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 m-auto w-[70vw] max-w-none object-contain opacity-[0.13] select-none"
      />
      <div className="relative w-full max-w-sm">
        <h1 className="font-heading text-[22px] leading-[1.3] font-medium text-sand mb-1">
          Anmelden
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          Melden Sie sich mit Ihrem D4U-Konto an.
        </p>
        <LoginForm />
      </div>
    </div>
  );
}
