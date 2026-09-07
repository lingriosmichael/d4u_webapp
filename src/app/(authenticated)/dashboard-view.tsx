import Link from "next/link";
import { redirect } from "next/navigation";
import { PageContainer, PageHeader, StatusPill, EmptyState } from "@/components/layout/app-shell";
import { fmtEUR, fmtDate, statusLabel, statusTone } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { getCurrentUserProfile } from "@/lib/supabase/queries/current-user";
import {
  getDashboardProjects,
  getDashboardBudgetStatus,
  getDashboardExpenses,
  needsActionFor,
} from "@/lib/supabase/queries/dashboard";
import { ArrowUpRight, TriangleAlert } from "lucide-react";
import { computeBudgetFigures, BUDGET_LABELS } from "@/lib/budget-figures";

export async function DashboardView() {
  const user = await getCurrentUserProfile();
  // app/(authenticated)/layout.tsx already redirects if there's no session; this is
  // just satisfying TypeScript for the (unreachable in practice) case where
  // the session expires between that check and this one.
  if (!user) redirect("/login");

  const [projects, budgetStatuses, expenses] = await Promise.all([
    getDashboardProjects(),
    getDashboardBudgetStatus(),
    getDashboardExpenses(),
  ]);

  const budgetStatusByProject = new Map(budgetStatuses.map((b) => [b.projectId, b]));
  const projectById = new Map(projects.map((p) => [p.id, p]));

  const pending = needsActionFor(expenses, user.role);
  const visibleProjects =
    user.role === "project_manager" ? projects.filter((p) => p.leadUserId === user.id) : projects;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Übersicht"
        title="Offene Aufgaben"
        description={
          pending.length === 0
            ? "Sie sind auf dem aktuellen Stand."
            : `Sie haben ${pending.length} ${pending.length === 1 ? "Vorgang" : "Vorgänge"} zur Bearbeitung zugewiesen.`
        }
      />

      {pending.length === 0 ? (
        <EmptyState
          title="Alles erledigt."
          description="Keine Belege warten aktuell auf Ihre Aktion."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {pending.map((e) => {
            const project = projectById.get(e.projectId);
            return (
              <Link
                key={e.id}
                href={`/expenses/${e.id}`}
                className="group bg-card ring-1 ring-line card-shape p-5 flex flex-col justify-between h-48 hover:ring-clay/30 transition-all"
              >
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <StatusPill tone={statusTone(e.status)}>{statusLabel(e.status)}</StatusPill>
                    <span className="text-[10px] font-mono text-muted-foreground">{e.id}</span>
                  </div>
                  <h3 className="font-medium text-foreground leading-tight mb-1 line-clamp-1">
                    {e.description}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {project?.name} · {fmtEUR(e.amount)}
                  </p>
                  {e.partnerName && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Partner: {e.partnerName}
                    </p>
                  )}
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t border-line">
                  <span>
                    {e.submittedByName ?? "—"} · {fmtDate(e.createdAt)}
                  </span>
                  <ArrowUpRight className="size-3.5 opacity-60 group-hover:opacity-100 transition-opacity" />
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <section className="mt-12">
        <div className="mb-6">
          <h2 className="font-heading text-[22px] leading-[1.3] font-medium text-foreground tracking-tight">
            Budget-Status
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            {user.role === "project_manager"
              ? "Ihre Projekte im Überblick."
              : "Auslastung der laufenden Projekte."}
          </p>
        </div>

        <div className="space-y-3">
          {visibleProjects.map((p) => {
            const { soll, ist, obligo } = budgetStatusByProject.get(p.id) ?? {
              soll: 0,
              ist: 0,
              obligo: 0,
            };
            const { verfuegbar, hasInvalidData, isOverBudget, istPct, obligoPct } =
              computeBudgetFigures(soll, ist, obligo);

            return (
              <Link
                key={p.id}
                href={`/visualization?project=${p.id}`}
                className="block bg-card ring-1 ring-line card-shape p-5 hover:ring-clay/30 transition-all"
              >
                <div className="flex justify-between items-center mb-3">
                  <div>
                    <div className="text-sm font-medium">{p.name}</div>
                    <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                      {p.code}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground" title="Soll — bewilligtes Budget">
                    Gesamtbudget: {fmtEUR(soll)}
                  </div>
                </div>

                {hasInvalidData ? (
                  <div
                    className="h-3 rounded-full bg-[repeating-linear-gradient(135deg,var(--line),var(--line)_4px,var(--card)_4px,var(--card)_8px)] ring-1 ring-inset ring-destructive/30"
                    title="Diese Zahlen wirken fehlerhaft (negativer Betrag) — bitte in Verwaltung prüfen."
                  />
                ) : (
                  <div className="h-3 flex gap-[2px] bg-line rounded-full overflow-hidden">
                    <div
                      className="h-full bg-chart-ist first:rounded-l-full"
                      style={{ width: `${istPct}%` }}
                    />
                    <div
                      className="h-full bg-chart-obligo last:rounded-r-full"
                      style={{ width: `${obligoPct}%` }}
                    />
                  </div>
                )}

                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {BUDGET_LABELS.ist}:{" "}
                    <span
                      className={cn(
                        "font-medium",
                        ist < 0 ? "text-destructive" : "text-foreground",
                      )}
                    >
                      {fmtEUR(ist)}
                    </span>
                  </span>
                  <span className="text-muted-foreground">
                    {BUDGET_LABELS.obligo}:{" "}
                    <span
                      className={cn(
                        "font-medium",
                        obligo < 0 ? "text-destructive" : "text-foreground",
                      )}
                    >
                      {fmtEUR(obligo)}
                    </span>
                  </span>
                  <span className="text-muted-foreground">
                    {BUDGET_LABELS.verfuegbar}:{" "}
                    <span
                      className={cn(
                        "font-medium",
                        isOverBudget ? "text-destructive" : "text-stone",
                      )}
                    >
                      {fmtEUR(verfuegbar)}
                    </span>
                  </span>
                </div>

                {hasInvalidData && (
                  <div className="mt-2 flex items-center gap-1.5 text-[11px] text-destructive">
                    <TriangleAlert className="size-3.5 shrink-0" />
                    <span>Zahlen wirken fehlerhaft — bitte in Verwaltung prüfen.</span>
                  </div>
                )}
                {isOverBudget && (
                  <div className="mt-2 flex items-center gap-1.5 text-[11px] text-destructive">
                    <TriangleAlert className="size-3.5 shrink-0" />
                    <span>Budget überschritten.</span>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      </section>

      <section className="mt-12">
        <div className="mb-6">
          <h2 className="font-heading text-[22px] leading-[1.3] font-medium text-foreground tracking-tight">
            Aktuelle Belege im Umlauf
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Alle Belege — auch solche, für die aktuell keine Aktion Ihrerseits erforderlich ist.
          </p>
        </div>
        <div className="bg-card ring-1 ring-line card-shape overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground bg-secondary/50">
              <tr>
                <th className="text-left px-5 py-3">ID</th>
                <th className="text-left px-5 py-3">Beschreibung</th>
                <th className="text-left px-5 py-3">Projekt</th>
                <th className="text-right px-5 py-3">Betrag</th>
                <th className="text-left px-5 py-3">Status</th>
                <th className="text-left px-5 py-3">Datum</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => {
                const project = projectById.get(e.projectId);
                return (
                  // No whole-row click here (that needed a client-side
                  // onClick) — this is now a Server Component, so the ID
                  // link is the click target, same as every other list in
                  // the app.
                  <tr
                    key={e.id}
                    className="border-t border-line hover:bg-secondary/40 transition-colors"
                  >
                    <td className="px-5 py-3 font-mono text-xs text-muted-foreground">
                      <Link href={`/expenses/${e.id}`}>{e.id}</Link>
                    </td>
                    <td className="px-5 py-3">{e.description}</td>
                    <td className="px-5 py-3 text-muted-foreground">{project?.name}</td>
                    <td className="px-5 py-3 text-right font-medium tabular-nums">
                      {fmtEUR(e.amount)}
                    </td>
                    <td className="px-5 py-3">
                      <StatusPill tone={statusTone(e.status)}>{statusLabel(e.status)}</StatusPill>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground text-xs">
                      {fmtDate(e.createdAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </PageContainer>
  );
}
