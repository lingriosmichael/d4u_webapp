"use client";

import { useEffect } from "react";

// Only reached if the root layout itself throws (error.tsx handles every
// other route-level error) -- Next.js requires this file to render its own
// <html>/<body> since there's no outer layout left to rely on. Previously
// missing entirely, so a root-layout crash fell through to Next's raw,
// unstyled default error screen instead of this app's own voice.
export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="de">
      <body>
        <div className="flex min-h-screen items-center justify-center bg-background px-4">
          <div className="max-w-md text-center">
            <h1 className="font-heading text-[22px] leading-[1.3] font-medium tracking-tight text-foreground">
              Diese Seite konnte nicht geladen werden
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Bitte versuchen Sie es erneut oder laden Sie die Seite neu.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <button
                onClick={() => reset()}
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Erneut versuchen
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
