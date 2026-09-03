import { createFileRoute, Link } from "@tanstack/react-router";
import { PageContainer, PageHeader, StatusPill } from "@/components/app-shell";
import { useCurrentUser } from "@/lib/role-context";
import {
  needsActionFor,
  getProject,
  getUser,
  getPartner,
  fmtEUR,
  fmtDate,
  statusLabel,
  statusTone,
  expenses,
  budgetStatusForProject,
  projects,
} from "@/lib/mock-data";
import { Card } from "@/components/ui/card";
import { ArrowUpRight, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Übersicht — D4U Finance" },
      { name: "description", content: "Ihre offenen Aufgaben und Projektbudgets im Überblick." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { user } = useCurrentUser();
  const pending = needsActionFor(user);
  const visibleProjects =
    user.role === "project_manager"
      ? projects.filter((p) => p.leadUserId === user.id)
      : projects;

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
        <Card className="bg-card p-10 text-center">
          <div className="mx-auto size-10 rounded-full bg-success/10 grid place-items-center mb-4">
            <CheckCircle2 className="size-5 text-success" />
          </div>
          <h2 className="font-heading font-semibold text-foreground">Alles erledigt.</h2>
          <p className="text-sm text-muted-foreground mt-1">Keine Belege warten aktuell auf Ihre Aktion.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {pending.map((e) => {
            const project = getProject(e.projectId);
            const submitter = getUser(e.submittedByUserId);
            const partner = getPartner(e.partnerId);
            return (
              <Link
                key={e.id}
                to="/expenses/$id"
                params={{ id: e.id }}
                className="group bg-card ring-1 ring-black/5 rounded-xl p-5 flex flex-col justify-between h-48 hover:ring-navy-600/30 transition-all"
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
                  {partner && (
                    <p className="text-[10px] text-muted-foreground mt-1">Partner: {partner.name}</p>
                  )}
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t border-black/5">
                  <span>
                    {submitter?.name} · {fmtDate(e.createdAt)}
                  </span>
                  <ArrowUpRight className="size-3.5 opacity-60 group-hover:opacity-100 transition-opacity" />
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <section className="mt-16">
        <div className="mb-6">
          <h2 className="font-heading text-lg font-semibold text-foreground tracking-tight">
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
            const { soll, ist, obligo } = budgetStatusForProject(p.id);
            const istPct = soll > 0 ? (ist / soll) * 100 : 0;
            const obPct = soll > 0 ? (obligo / soll) * 100 : 0;
            return (
              <Link
                key={p.id}
                to="/visualization"
                search={{ project: p.id }}
                className="block bg-card ring-1 ring-black/5 rounded-xl p-5 hover:ring-navy-600/30 transition-all"
              >
                <div className="flex justify-between items-center mb-3">
                  <div>
                    <div className="text-sm font-medium">{p.name}</div>
                    <div className="text-[10px] font-mono text-muted-foreground mt-0.5">{p.code}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">Gesamt: {fmtEUR(soll)}</div>
                </div>
                <div className="h-2 flex bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-chart-ist" style={{ width: `${Math.min(istPct, 100)}%` }} />
                  <div
                    className="h-full bg-chart-obligo"
                    style={{ width: `${Math.min(obPct, Math.max(0, 100 - istPct))}%` }}
                  />
                </div>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    Ist: <span className="text-foreground font-medium">{fmtEUR(ist)}</span>
                  </span>
                  <span className="text-muted-foreground">
                    Obligo: <span className="text-foreground font-medium">{fmtEUR(obligo)}</span>
                  </span>
                  <span className="text-muted-foreground">
                    Verfügbar:{" "}
                    <span className="text-navy-600 font-medium">
                      {fmtEUR(Math.max(0, soll - ist - obligo))}
                    </span>
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="mt-16">
        <div className="mb-6">
          <h2 className="font-heading text-lg font-semibold text-foreground tracking-tight">
            Aktuelle Belege im Umlauf
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Alle Belege — auch solche, für die aktuell keine Aktion Ihrerseits erforderlich ist.
          </p>
        </div>
        <div className="bg-card ring-1 ring-black/5 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-[10px] font-heading font-semibold uppercase tracking-widest text-muted-foreground bg-secondary/50">
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
                const project = getProject(e.projectId);
                return (
                  <tr
                    key={e.id}
                    onClick={(ev) => {
                      // let Link handle nav via id column
                      ev.currentTarget.querySelector<HTMLAnchorElement>("a")?.click();
                    }}
                    className="border-t border-black/5 hover:bg-secondary/40 cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3 font-mono text-xs text-muted-foreground">
                      <Link to="/expenses/$id" params={{ id: e.id }}>
                        {e.id}
                      </Link>
                    </td>
                    <td className="px-5 py-3">{e.description}</td>
                    <td className="px-5 py-3 text-muted-foreground">{project?.name}</td>
                    <td className="px-5 py-3 text-right font-medium tabular-nums">{fmtEUR(e.amount)}</td>
                    <td className="px-5 py-3">
                      <StatusPill tone={statusTone(e.status)}>{statusLabel(e.status)}</StatusPill>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground text-xs">{fmtDate(e.createdAt)}</td>
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
