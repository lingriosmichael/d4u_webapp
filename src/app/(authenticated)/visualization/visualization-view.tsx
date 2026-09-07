import Link from "next/link";
import { PageContainer, PageHeader, StatusPill } from "@/components/layout/app-shell";
import { getCurrentUserProfile } from "@/lib/supabase/queries/current-user";
import {
  getVisualizationOverview,
  getProjectDrilldown,
  getAdvanceOverview,
  getExpenseOverview,
  getExpenseOverviewFilterOptions,
  parseExpenseOverviewFilters,
  type BudgetStatus,
  type AdvanceOverviewRow,
  type ExpenseOverviewRow,
} from "@/lib/supabase/queries/visualization";
import { fmtEUR, fmtDate, statusLabel, statusTone, roleLabels } from "@/lib/mock-data";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { ExpenseFilterBar } from "./expense-filter-bar";
import { computeBudgetFigures, BUDGET_LABELS, type BudgetFigures } from "@/lib/budget-figures";
import { VisualizationTabs } from "./visualization-tabs";

// Converted from lib/mock-data.ts to real Supabase reads (server-fetched,
// same pattern as Übersicht/Expense Detail/Verwaltung). Read-only screen —
// no write actions, so no d4u_backend calls needed here. An async Server
// Component throughout rather than the page.tsx-fetches/client-renders
// split used elsewhere: nothing on this screen needs client-side
// interactivity beyond plain links, so there's no reason to ship any JS
// for it — the role-based project filter reads the session server-side
// instead of via useCurrentUser().
export async function Visualization({
  projectId: selectedProjectId,
  expenseFilters: rawExpenseFilters,
}: {
  projectId?: string;
  expenseFilters?: {
    status?: string;
    responsible?: string;
    costCenter?: string;
    expenseProject?: string;
    from?: string;
    to?: string;
  };
}) {
  if (selectedProjectId) {
    return <ProjectDrilldown projectId={selectedProjectId} />;
  }

  const user = await getCurrentUserProfile();
  const { projects, statusByProject, pendingCount, openAdvancesCount } =
    await getVisualizationOverview();

  const visibleProjects =
    user?.role === "project_manager" ? projects.filter((p) => p.leadUserId === user.id) : projects;

  // Vorschuss-Übersicht and Belege-Übersicht are both Accounting/CEO only
  // (confirmed decisions) — RLS reads are broader (also finance_manager,
  // admin), so this is an app-level gate, same pattern as the
  // project_manager filter above.
  const canSeeAdvances = user?.role === "accounting" || user?.role === "ceo";
  const advances = canSeeAdvances ? await getAdvanceOverview() : [];

  const expenseFilters = parseExpenseOverviewFilters(rawExpenseFilters ?? {});
  const [expenses, expenseFilterOptions] = canSeeAdvances
    ? await Promise.all([getExpenseOverview(expenseFilters), getExpenseOverviewFilterOptions()])
    : [[] as ExpenseOverviewRow[], { costCenters: [], projects: [] }];

  const budgetStatusContent = (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
        <StatCard
          label="Belege in Prüfung"
          value={String(pendingCount)}
          hint="Alle Freigabestufen"
        />
        <StatCard
          label="Offene Vorschüsse"
          value={String(openAdvancesCount)}
          hint="Warten auf Abrechnung"
        />
      </div>

      <h2 className="font-heading text-[22px] leading-[1.3] font-medium mb-4">Projekte</h2>

      <div className="space-y-3">
        {visibleProjects.map((p) => {
          const status = statusByProject[p.id] ?? { soll: 0, ist: 0, obligo: 0 };
          return (
            <ProjectRow key={p.id} projectId={p.id} name={p.name} code={p.code} status={status} />
          );
        })}
      </div>
    </>
  );

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Auswertung"
        title="Budget-Status"
        description={`Ein kompakter Überblick der laufenden Projekte nach Gesamtbudget, ${BUDGET_LABELS.ist}, ${BUDGET_LABELS.obligo} und ${BUDGET_LABELS.verfuegbar}.`}
      />

      {canSeeAdvances ? (
        // Accounting/CEO get three concentrated tabs instead of everything
        // stacked on one page — same top-tab bar as Verwaltung.
        <VisualizationTabs
          budgetStatus={budgetStatusContent}
          expenseOverview={
            <ExpenseOverviewSection
              expenses={expenses}
              costCenters={expenseFilterOptions.costCenters}
              projects={expenseFilterOptions.projects}
            />
          }
          advanceOverview={<AdvanceOverviewSection advances={advances} />}
        />
      ) : (
        budgetStatusContent
      )}
    </PageContainer>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-card ring-1 ring-line card-shape p-5">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold">{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}

/** Renders the Ausgezahlt/Geplant/Verfügbar bar, or a flat hatched warning bar when the underlying data is corrupted. */
function BudgetBar({ figures, warn }: { figures: BudgetFigures; warn?: boolean }) {
  if (figures.hasInvalidData) {
    return (
      <div
        className="h-2.5 rounded-full bg-[repeating-linear-gradient(135deg,var(--line),var(--line)_4px,var(--card)_4px,var(--card)_8px)] ring-1 ring-inset ring-destructive/30"
        title="Diese Zahlen wirken fehlerhaft (negativer Betrag) — bitte in Verwaltung prüfen."
      />
    );
  }
  return (
    <div className="h-2.5 flex gap-[2px] bg-line rounded-full overflow-hidden">
      <div
        className={cn("h-full first:rounded-l-full", warn ? "bg-warning" : "bg-chart-ist")}
        style={{ width: `${figures.istPct}%` }}
      />
      <div
        className={cn("h-full last:rounded-r-full", warn ? "bg-warning" : "bg-chart-obligo")}
        style={{ width: `${figures.obligoPct}%` }}
      />
    </div>
  );
}

function BudgetDataWarning({ figures }: { figures: BudgetFigures }) {
  if (figures.hasInvalidData) {
    return (
      <div className="mt-3 flex items-center gap-1.5 text-[11px] text-destructive">
        <TriangleAlert className="size-3.5 shrink-0" />
        <span>Zahlen wirken fehlerhaft — bitte in Verwaltung prüfen.</span>
      </div>
    );
  }
  if (figures.isOverBudget) {
    return (
      <div className="mt-3 flex items-center gap-1.5 text-[11px] text-destructive">
        <TriangleAlert className="size-3.5 shrink-0" />
        <span>Budget überschritten.</span>
      </div>
    );
  }
  return null;
}

function AdvanceOverviewSection({ advances }: { advances: AdvanceOverviewRow[] }) {
  if (advances.length === 0) {
    return (
      <div className="bg-card ring-1 ring-line card-shape p-6 text-sm text-muted-foreground">
        Keine Partner-Vorschüsse vorhanden.
      </div>
    );
  }
  return (
    <div className="bg-card ring-1 ring-line card-shape overflow-hidden">
      <table className="w-full text-sm">
        <thead className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground bg-secondary/40">
          <tr>
            <th className="text-left px-6 py-3">Partner</th>
            <th className="text-right px-6 py-3">Vorschussbetrag</th>
            <th className="text-right px-6 py-3">Verrechnet</th>
            <th className="text-right px-6 py-3">Freigegeben</th>
            <th className="text-left px-6 py-3">Status</th>
            <th className="text-left px-6 py-3">Abgerechnet am</th>
          </tr>
        </thead>
        <tbody>
          {advances.map((a) => {
            const freigegeben = a.reconciledAmount === null ? null : a.amount - a.reconciledAmount;
            return (
              <tr key={a.id} className="border-t border-line">
                <td className="px-6 py-3">{a.partnerName}</td>
                <td className="px-6 py-3 text-right font-mono">{fmtEUR(a.amount)}</td>
                <td className="px-6 py-3 text-right font-mono text-muted-foreground">
                  {a.reconciledAmount === null ? "—" : fmtEUR(a.reconciledAmount)}
                </td>
                <td className="px-6 py-3 text-right font-mono">
                  {freigegeben === null ? "—" : fmtEUR(freigegeben)}
                </td>
                <td className="px-6 py-3 text-muted-foreground">
                  {a.status === "reconciled" ? "Abgerechnet" : "Offen"}
                </td>
                <td className="px-6 py-3 text-muted-foreground">
                  {a.reconciledAt ? new Date(a.reconciledAt).toLocaleDateString("de-DE") : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function responsiblePartyLabel(party: ExpenseOverviewRow["responsibleParty"]): string {
  if (!party) return "—";
  return party === "submitter" ? "Einreicher:in" : roleLabels[party];
}

function ExpenseOverviewSection({
  expenses,
  costCenters,
  projects,
}: {
  expenses: ExpenseOverviewRow[];
  costCenters: Array<{ id: string; code: string; name: string }>;
  projects: Array<{ id: string; code: string; name: string }>;
}) {
  const byProject = new Map<
    string,
    { projectCode: string; projectName: string; rows: ExpenseOverviewRow[] }
  >();
  for (const e of expenses) {
    const group = byProject.get(e.projectId) ?? {
      projectCode: e.projectCode,
      projectName: e.projectName,
      rows: [],
    };
    group.rows.push(e);
    byProject.set(e.projectId, group);
  }

  return (
    <div>
      <ExpenseFilterBar costCenters={costCenters} projects={projects} />

      {expenses.length === 0 ? (
        <div className="bg-card ring-1 ring-line card-shape p-6 text-sm text-muted-foreground">
          Keine Belege für die gewählten Filter.
        </div>
      ) : (
        <div className="space-y-6">
          {[...byProject.entries()].map(([projectId, group]) => (
            <div key={projectId}>
              <div className="text-xs font-mono text-muted-foreground mb-2">
                {group.projectCode} · {group.projectName}
              </div>
              <div className="bg-card ring-1 ring-line card-shape overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground bg-secondary/40">
                    <tr>
                      <th className="text-left px-6 py-3">Kostenstelle</th>
                      <th className="text-left px-6 py-3">Beschreibung</th>
                      <th className="text-right px-6 py-3">Betrag</th>
                      <th className="text-left px-6 py-3">Status</th>
                      <th className="text-left px-6 py-3">Zuständig</th>
                      <th className="text-left px-6 py-3">Eingereicht am</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((e) => (
                      <tr key={e.id} className="border-t border-line hover:bg-secondary/20">
                        <td className="px-6 py-3">
                          <Link href={`/expenses/${e.id}`} className="block">
                            {e.costCenterCode ? `${e.costCenterCode} · ${e.costCenterName}` : "—"}
                          </Link>
                        </td>
                        <td className="px-6 py-3">
                          <Link href={`/expenses/${e.id}`} className="block">
                            {e.description}
                            {e.vendorName && (
                              <span className="text-muted-foreground"> · {e.vendorName}</span>
                            )}
                          </Link>
                        </td>
                        <td className="px-6 py-3 text-right font-mono">
                          <Link href={`/expenses/${e.id}`} className="block">
                            {fmtEUR(e.amount)}
                          </Link>
                        </td>
                        <td className="px-6 py-3">
                          <Link href={`/expenses/${e.id}`} className="block">
                            <StatusPill tone={statusTone(e.status)}>
                              {statusLabel(e.status)}
                            </StatusPill>
                          </Link>
                        </td>
                        <td className="px-6 py-3 text-muted-foreground">
                          <Link href={`/expenses/${e.id}`} className="block">
                            {responsiblePartyLabel(e.responsibleParty)}
                          </Link>
                        </td>
                        <td className="px-6 py-3 text-muted-foreground">
                          <Link href={`/expenses/${e.id}`} className="block">
                            {fmtDate(e.createdAt)}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectRow({
  projectId,
  name,
  code,
  status,
}: {
  projectId: string;
  name: string;
  code: string;
  status: BudgetStatus;
}) {
  const { soll, ist, obligo } = status;
  const figures = computeBudgetFigures(soll, ist, obligo);

  return (
    <Link
      href={`/visualization?project=${projectId}`}
      className="block bg-card ring-1 ring-line card-shape p-6 hover:ring-clay/30 transition-all"
    >
      <div className="flex justify-between items-center mb-4">
        <div>
          <div className="text-sm font-medium">{name}</div>
          <div className="text-[10px] font-mono text-muted-foreground mt-0.5">{code}</div>
        </div>
        <div className="text-xs text-muted-foreground font-mono" title="Soll — bewilligtes Budget">
          Gesamtbudget: {fmtEUR(soll)}
        </div>
      </div>
      <BudgetBar figures={figures} />
      <div className="mt-4 grid grid-cols-3 divide-x divide-line">
        <Metric
          label={BUDGET_LABELS.ist}
          value={fmtEUR(ist)}
          tone={ist < 0 ? "danger" : "default"}
        />
        <Metric
          label={BUDGET_LABELS.obligo}
          value={fmtEUR(obligo)}
          tone={obligo < 0 ? "danger" : "default"}
        />
        <Metric
          label={BUDGET_LABELS.verfuegbar}
          value={fmtEUR(figures.verfuegbar)}
          tone={figures.isOverBudget ? "danger" : "info"}
        />
      </div>
      <BudgetDataWarning figures={figures} />
    </Link>
  );
}

function Metric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  // "warning" is the 80% threshold line — advisory, never a block, so it
  // stays Threshold-colored rather than reusing "danger" (Over/rejected).
  tone?: "default" | "info" | "warning" | "danger";
}) {
  return (
    <div className="px-4 first:pl-0">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 text-sm font-semibold font-mono",
          tone === "info" && "text-stone",
          tone === "warning" && "text-warning-foreground",
          tone === "danger" && "text-destructive",
        )}
      >
        {value}
      </div>
    </div>
  );
}

async function ProjectDrilldown({ projectId }: { projectId: string }) {
  const { project, total, groups } = await getProjectDrilldown(projectId);

  if (!project) {
    return (
      <PageContainer>
        <PageHeader title="Projekt nicht gefunden" />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <Link
        href="/visualization"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors"
      >
        <ArrowLeft className="size-3.5" /> Alle Projekte
      </Link>
      <PageHeader
        eyebrow={project.code}
        title={project.name}
        description={
          <>
            Gesamtbudget: {fmtEUR(total.soll)} · {BUDGET_LABELS.ist}:{" "}
            <span className={cn(total.ist < 0 && "text-destructive")}>{fmtEUR(total.ist)}</span> ·{" "}
            {BUDGET_LABELS.obligo}:{" "}
            <span className={cn(total.obligo < 0 && "text-destructive")}>
              {fmtEUR(total.obligo)}
            </span>{" "}
            · {BUDGET_LABELS.verfuegbar}:{" "}
            <span
              className={cn(
                (total.ist < 0 || total.obligo < 0 || total.soll - total.ist - total.obligo < 0) &&
                  "text-destructive",
              )}
            >
              {fmtEUR(total.soll - total.ist - total.obligo)}
            </span>
          </>
        }
      />

      <h2 className="font-heading text-[22px] leading-[1.3] font-medium mb-4">
        Kostenstellen-Gruppen
      </h2>

      <div className="space-y-3">
        {groups.map((g) => {
          const { soll, ist, obligo } = g.status;
          const figures = computeBudgetFigures(soll, ist, obligo);
          // Combined committed spend, not Ist alone (BUG-013,
          // test-run/findings/BUGS.md) — a budget line that's heavily
          // committed via Obligo but hasn't paid much out yet is exactly
          // the state this warning exists to catch.
          const utilizationPct = soll > 0 ? ((ist + obligo) / soll) * 100 : 0;
          const warn = utilizationPct >= g.warningThresholdPct;

          return (
            <div key={g.id} className="bg-card ring-1 ring-line card-shape p-6">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <div className="text-sm font-medium">{g.name}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    Enthält {g.costCenters.length} Kostenstellen — Budget wird auf Gruppenebene
                    geführt.
                  </div>
                </div>
                <div
                  className="text-xs text-muted-foreground font-mono"
                  title="Soll — bewilligtes Budget"
                >
                  {fmtEUR(soll)}
                </div>
              </div>
              <BudgetBar figures={figures} warn={warn} />
              <div className="mt-4 grid grid-cols-4 divide-x divide-line">
                <Metric
                  label={BUDGET_LABELS.ist}
                  value={fmtEUR(ist)}
                  tone={ist < 0 ? "danger" : "default"}
                />
                <Metric
                  label={BUDGET_LABELS.obligo}
                  value={fmtEUR(obligo)}
                  tone={obligo < 0 ? "danger" : "default"}
                />
                <Metric
                  label={BUDGET_LABELS.verfuegbar}
                  value={fmtEUR(figures.verfuegbar)}
                  tone={figures.isOverBudget ? "danger" : "info"}
                />
                <Metric
                  label="Auslastung"
                  value={`${Math.round(utilizationPct)} %`}
                  tone={warn ? "warning" : "default"}
                />
              </div>
              <BudgetDataWarning figures={figures} />

              <div className="mt-5 pt-5 border-t border-line">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Kostenstellen dieser Gruppe (nur Tagging — kein eigenes Budget)
                </div>
                <div className="flex flex-wrap gap-2">
                  {g.costCenters.map((c) => (
                    <span
                      key={c.id}
                      className="text-xs bg-secondary rounded-full px-2.5 py-1 font-mono"
                    >
                      {c.code} <span className="text-muted-foreground font-body">· {c.name}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </PageContainer>
  );
}
