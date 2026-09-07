import Link from "next/link";
import { redirect } from "next/navigation";
import { PageContainer, PageHeader, StatusPill, EmptyState } from "@/components/layout/app-shell";
import { fmtEUR, fmtDate, statusLabel, statusTone } from "@/lib/mock-data";
import { getCurrentUserProfile } from "@/lib/supabase/queries/current-user";
import {
  getMyOpenAdvances,
  getAdvancesAwaitingConfirmation,
  type OpenAdvanceSummary,
} from "@/lib/supabase/queries/advances";
import { Card } from "@/components/ui/card";

// The new, non-role-gated "Vorschüsse" tab (test-run/OPEN_DECISIONS.md item
// #2's replacement design) — every submitter sees their own open advances
// here, not just Accounting/CEO's read-only Vorschuss-Übersicht in
// Auswertung (which stays exactly as it was, untouched by this feature).
export async function AdvancesView() {
  const user = await getCurrentUserProfile();
  if (!user) redirect("/login");

  const [mine, awaitingConfirmation] = await Promise.all([
    getMyOpenAdvances(user.id),
    user.role === "accounting" ? getAdvancesAwaitingConfirmation() : Promise.resolve([]),
  ]);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Vorschüsse"
        title="Offene Vorschüsse"
        description="Vorschüsse, die Sie selbst eingereicht haben und noch abrechnen müssen."
      />

      {mine.length === 0 ? (
        <EmptyState
          title="Keine offenen Vorschüsse."
          description="Sie haben aktuell keine offenen Vorschüsse."
        />
      ) : (
        <div className="space-y-3">
          {mine.map((advance) => (
            <AdvanceRow key={advance.id} advance={advance} />
          ))}
        </div>
      )}

      {user.role === "accounting" && (
        <section className="mt-12">
          <div className="mb-6">
            <h2 className="font-heading text-[22px] leading-[1.3] font-medium text-foreground tracking-tight">
              Zur Bestätigung eingereicht
            </h2>
            <p className="text-muted-foreground text-sm mt-1">
              Vorschüsse, deren Positionen vollständig belegt sind und auf Ihre Freigabe warten.
            </p>
          </div>
          {awaitingConfirmation.length === 0 ? (
            <EmptyState
              title="Nichts zu bestätigen."
              description="Aktuell wartet kein Vorschuss auf Ihre Bestätigung."
            />
          ) : (
            <div className="space-y-3">
              {awaitingConfirmation.map((advance) => (
                <AdvanceRow key={advance.id} advance={advance} />
              ))}
            </div>
          )}
        </section>
      )}
    </PageContainer>
  );
}

function AdvanceRow({ advance }: { advance: OpenAdvanceSummary }) {
  return (
    <Link href={`/advances/${advance.id}`}>
      <Card className="p-5 flex items-center justify-between gap-4 hover:ring-1 hover:ring-ember/40 transition-shadow">
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{advance.description}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {advance.projectName ?? "—"} · {advance.partnerName ?? "—"} ·{" "}
            {advance.submitterName ?? "—"} · {fmtDate(advance.createdAt)}
          </div>
          {advance.childCount > 0 && (
            <div className="text-xs text-muted-foreground mt-0.5">
              {advance.childrenWithReceiptCount} von {advance.childCount} Positionen mit Beleg
            </div>
          )}
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <div className="font-mono text-sm">{fmtEUR(advance.amount)}</div>
          <StatusPill tone={statusTone(advance.status)}>{statusLabel(advance.status)}</StatusPill>
        </div>
      </Card>
    </Link>
  );
}
