import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { useCurrentUser } from "@/lib/role-context";
import {
  projects,
  costCenterGroups,
  budgetStatusForProject,
  budgetStatusForGroup,
  budgetForGroup,
  fmtEUR,
  expenses,
  getProject,
  getCostCenter,
} from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { ExternalLink, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  project: z.string().optional(),
});

export const Route = createFileRoute("/visualization")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Auswertung — D4U Finance" },
      { name: "description", content: "Soll/Ist/Obligo je Projekt und Kostenstellen-Gruppe." },
    ],
  }),
  component: Visualization,
});

function Visualization() {
  const { user } = useCurrentUser();
  const { project: selectedProjectId } = Route.useSearch();

  const visibleProjects =
    user.role === "project_manager" ? projects.filter((p) => p.leadUserId === user.id) : projects;

  if (selectedProjectId) {
    return <ProjectDrilldown projectId={selectedProjectId} />;
  }

  const pendingCount = expenses.filter((e) =>
    ["finance_approval", "ceo_approval", "accounting_approval", "submitted_pending"].includes(e.status),
  ).length;
  const openAdvances = expenses.filter((e) => e.status === "submitted_unverified").length;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Auswertung"
        title="Budget-Status"
        description="Ein kompakter Überblick der laufenden Projekte. Für Detailanalysen und Exporte verwenden Sie bitte Metabase."
        actions={
          <Button variant="outline" size="sm" asChild>
            <a href="https://metabase.example.com" target="_blank" rel="noreferrer">
              <ExternalLink className="size-3.5" /> Metabase öffnen
            </a>
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
        <StatCard label="Belege in Prüfung" value={String(pendingCount)} hint="Alle Freigabestufen" />
        <StatCard label="Offene Vorschüsse" value={String(openAdvances)} hint="Warten auf Abrechnung" />
      </div>

      <div className="mb-4 flex items-center gap-4">
        <h2 className="font-heading text-lg font-semibold">Projekte</h2>
        <Legend />
      </div>

      <div className="space-y-3">
        {visibleProjects.map((p) => {
          const s = budgetStatusForProject(p.id);
          return <ProjectRow key={p.id} projectId={p.id} name={p.name} code={p.code} status={s} />;
        })}
      </div>
    </PageContainer>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-card ring-1 ring-black/5 rounded-xl p-5">
      <div className="text-[10px] font-heading font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 font-heading text-3xl font-semibold">{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex gap-4 text-[10px] font-heading font-semibold uppercase tracking-widest text-muted-foreground">
      <div className="flex items-center gap-2">
        <div className="size-2 bg-chart-ist" /> Ist
      </div>
      <div className="flex items-center gap-2">
        <div className="size-2 bg-chart-obligo" /> Obligo
      </div>
      <div className="flex items-center gap-2">
        <div className="size-2 border border-foreground" /> Soll
      </div>
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
  status: { soll: number; ist: number; obligo: number };
}) {
  const { soll, ist, obligo } = status;
  const istPct = soll > 0 ? (ist / soll) * 100 : 0;
  const obPct = soll > 0 ? (obligo / soll) * 100 : 0;
  const overBudget = ist + obligo > soll;

  return (
    <Link
      to="/visualization"
      search={{ project: projectId }}
      className="block bg-card ring-1 ring-black/5 rounded-xl p-6 hover:ring-navy-600/30 transition-all"
    >
      <div className="flex justify-between items-center mb-4">
        <div>
          <div className="text-sm font-medium">{name}</div>
          <div className="text-[10px] font-mono text-muted-foreground mt-0.5">{code}</div>
        </div>
        <div className="text-xs text-muted-foreground font-mono">Gesamt: {fmtEUR(soll)}</div>
      </div>
      <div className="h-2.5 flex bg-secondary rounded-full overflow-hidden">
        <div className="h-full bg-chart-ist" style={{ width: `${Math.min(istPct, 100)}%` }} />
        <div
          className="h-full bg-chart-obligo"
          style={{ width: `${Math.min(obPct, Math.max(0, 100 - istPct))}%` }}
        />
      </div>
      <div className="mt-4 grid grid-cols-3 divide-x divide-black/5">
        <Metric label="Ist" value={fmtEUR(ist)} />
        <Metric label="Obligo" value={fmtEUR(obligo)} />
        <Metric
          label="Verfügbar"
          value={fmtEUR(Math.max(0, soll - ist - obligo))}
          tone={overBudget ? "danger" : "info"}
        />
      </div>
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
  tone?: "default" | "info" | "danger";
}) {
  return (
    <div className="px-4 first:pl-0">
      <div className="text-[10px] font-heading font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 text-sm font-semibold font-mono",
          tone === "info" && "text-navy-600",
          tone === "danger" && "text-destructive",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function ProjectDrilldown({ projectId }: { projectId: string }) {
  const project = getProject(projectId);
  if (!project) {
    return (
      <PageContainer>
        <PageHeader title="Projekt nicht gefunden" />
      </PageContainer>
    );
  }
  const groups = costCenterGroups.filter((g) => g.projectId === projectId);
  const total = budgetStatusForProject(projectId);

  return (
    <PageContainer>
      <Link
        to="/visualization"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors"
      >
        <ArrowLeft className="size-3.5" /> Alle Projekte
      </Link>
      <PageHeader
        eyebrow={project.code}
        title={project.name}
        description={
          <>Gesamtbudget: {fmtEUR(total.soll)} · Ist: {fmtEUR(total.ist)} · Obligo: {fmtEUR(total.obligo)}</>
        }
      />

      <div className="mb-4 flex items-center gap-4">
        <h2 className="font-heading text-lg font-semibold">Kostenstellen-Gruppen</h2>
        <Legend />
      </div>

      <div className="space-y-3">
        {groups.map((g) => {
          const budget = budgetForGroup(g.id);
          const s = budgetStatusForGroup(g.id);
          const istPct = s.soll > 0 ? (s.ist / s.soll) * 100 : 0;
          const obPct = s.soll > 0 ? (s.obligo / s.soll) * 100 : 0;
          const warn = budget && (s.ist / s.soll) * 100 >= budget.warningThresholdPct;

          return (
            <div key={g.id} className="bg-card ring-1 ring-black/5 rounded-xl p-6">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <div className="text-sm font-medium">{g.name}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    Enthält {g.costCenterIds.length} Kostenstellen — Budget wird auf Gruppenebene geführt.
                  </div>
                </div>
                <div className="text-xs text-muted-foreground font-mono">{fmtEUR(s.soll)}</div>
              </div>
              <div className="h-2.5 flex bg-secondary rounded-full overflow-hidden">
                <div className="h-full bg-chart-ist" style={{ width: `${Math.min(istPct, 100)}%` }} />
                <div
                  className="h-full bg-chart-obligo"
                  style={{ width: `${Math.min(obPct, Math.max(0, 100 - istPct))}%` }}
                />
              </div>
              <div className="mt-4 grid grid-cols-4 divide-x divide-black/5">
                <Metric label="Ist" value={fmtEUR(s.ist)} tone={warn ? "danger" : "default"} />
                <Metric label="Obligo" value={fmtEUR(s.obligo)} />
                <Metric label="Verfügbar" value={fmtEUR(Math.max(0, s.soll - s.ist - s.obligo))} tone="info" />
                <Metric
                  label="Auslastung"
                  value={`${Math.round(((s.ist + s.obligo) / (s.soll || 1)) * 100)} %`}
                />
              </div>

              <div className="mt-5 pt-5 border-t border-black/5">
                <div className="text-[10px] font-heading font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Kostenstellen dieser Gruppe (nur Tagging — kein eigenes Budget)
                </div>
                <div className="flex flex-wrap gap-2">
                  {g.costCenterIds.map((id) => {
                    const c = getCostCenter(id);
                    return c ? (
                      <span
                        key={id}
                        className="text-xs bg-secondary rounded-full px-2.5 py-1 font-mono"
                      >
                        {c.code} <span className="text-muted-foreground font-body">· {c.name}</span>
                      </span>
                    ) : null;
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-10 text-center">
        <Button variant="outline" asChild>
          <a href="https://metabase.example.com" target="_blank" rel="noreferrer">
            <ExternalLink className="size-3.5" /> Für tiefergehende Analysen — Metabase öffnen
          </a>
        </Button>
      </div>
    </PageContainer>
  );
}
