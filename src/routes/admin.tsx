import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { useCurrentUser } from "@/lib/role-context";
import {
  users,
  projects,
  costCenters,
  costCenterGroups,
  budgetLines,
  partners,
  auditLog,
  settings as settingsData,
  getProject,
  getCostCenter,
  getUser,
  groupsForProject,
  fmtDateTime,
  fmtEUR,
  type Role,
} from "@/lib/mock-data";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Administration — D4U Finance" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { user } = useCurrentUser();
  if (user.role !== "admin") {
    return (
      <PageContainer>
        <PageHeader
          eyebrow="Zugriff verweigert"
          title="Sie haben keinen Zugriff auf die Administration"
          description="Diese Ansicht ist ausschließlich für Administrator:innen. Wenden Sie sich bitte an Ihre Administration, falls Sie hier Zugriff benötigen."
        />
        <Navigate to="/" replace />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Administration"
        title="Verwaltung"
        description="Stammdaten, Nutzerrechte und Systemeinstellungen. Änderungen werden direkt gespeichert und im Änderungsprotokoll erfasst."
      />

      <Tabs defaultValue="users" className="w-full">
        <TabsList className="grid grid-cols-4 lg:grid-cols-8 h-auto p-1 bg-secondary/60">
          <TabsTrigger value="users" className="text-xs">Nutzer</TabsTrigger>
          <TabsTrigger value="projects" className="text-xs">Projekte</TabsTrigger>
          <TabsTrigger value="cc" className="text-xs">Kostenstellen</TabsTrigger>
          <TabsTrigger value="groups" className="text-xs">Gruppen</TabsTrigger>
          <TabsTrigger value="budget" className="text-xs">Budgets</TabsTrigger>
          <TabsTrigger value="partners" className="text-xs">Partner</TabsTrigger>
          <TabsTrigger value="settings" className="text-xs">Einstellungen</TabsTrigger>
          <TabsTrigger value="audit" className="text-xs">Protokoll</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-6"><UsersTab /></TabsContent>
        <TabsContent value="projects" className="mt-6"><ProjectsTab /></TabsContent>
        <TabsContent value="cc" className="mt-6"><CostCentersTab /></TabsContent>
        <TabsContent value="groups" className="mt-6"><GroupsTab /></TabsContent>
        <TabsContent value="budget" className="mt-6"><BudgetLinesTab /></TabsContent>
        <TabsContent value="partners" className="mt-6"><PartnersTab /></TabsContent>
        <TabsContent value="settings" className="mt-6"><SettingsTab /></TabsContent>
        <TabsContent value="audit" className="mt-6"><AuditTab /></TabsContent>
      </Tabs>
    </PageContainer>
  );
}

// ---- Helpers ---------------------------------------------------------------

function AdminCard({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-card ring-1 ring-black/5 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-black/5">
        <h2 className="font-heading font-semibold text-sm">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <table className="w-full text-sm">
      <thead className="text-[10px] font-heading font-semibold uppercase tracking-widest text-muted-foreground bg-secondary/40">
        <tr>
          {headers.map((h) => (
            <th key={h} className="text-left px-6 py-3">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

// ---- Users -----------------------------------------------------------------

const roleLabels: Record<Role, string> = {
  project_manager: "Projektleitung",
  finance_manager: "Finanzleitung",
  accounting: "Buchhaltung",
  ceo: "Geschäftsführung",
  admin: "Administration",
};

function UsersTab() {
  return (
    <AdminCard
      title="Nutzer"
      action={
        <Button size="sm" onClick={() => toast.info("Formular öffnen (Demo)")}>
          <Plus className="size-3.5" /> Nutzer anlegen
        </Button>
      }
    >
      <Table headers={["Name", "E-Mail", "Rolle", "Status", ""]}>
        {users.map((u) => (
          <tr key={u.id} className="border-t border-black/5">
            <td className="px-6 py-3">
              <div className="flex items-center gap-3">
                <div className="size-8 rounded-full bg-navy-100 grid place-items-center text-[10px] font-semibold text-navy-900">
                  {u.initials}
                </div>
                <span>{u.name}</span>
              </div>
            </td>
            <td className="px-6 py-3 text-muted-foreground">{u.email}</td>
            <td className="px-6 py-3">{roleLabels[u.role]}</td>
            <td className="px-6 py-3">
              <span className={cn("text-xs", u.active ? "text-success" : "text-muted-foreground")}>
                {u.active ? "Aktiv" : "Deaktiviert"}
              </span>
            </td>
            <td className="px-6 py-3 text-right">
              <Button size="sm" variant="ghost">Bearbeiten</Button>
            </td>
          </tr>
        ))}
      </Table>
    </AdminCard>
  );
}

// ---- Projects --------------------------------------------------------------

function ProjectsTab() {
  return (
    <AdminCard
      title="Projekte"
      action={
        <Button size="sm" onClick={() => toast.info("Projekt anlegen (Demo)")}>
          <Plus className="size-3.5" /> Projekt anlegen
        </Button>
      }
    >
      <Table headers={["Code", "Name", "Förderprogramm", "Leitung", "Zeitraum", ""]}>
        {projects.map((p) => (
          <tr key={p.id} className="border-t border-black/5">
            <td className="px-6 py-3 font-mono text-xs">{p.code}</td>
            <td className="px-6 py-3">{p.name}</td>
            <td className="px-6 py-3 text-muted-foreground">{p.fundingProgram}</td>
            <td className="px-6 py-3 text-muted-foreground">{getUser(p.leadUserId)?.name}</td>
            <td className="px-6 py-3 text-xs text-muted-foreground">
              {p.startDate} – {p.endDate}
            </td>
            <td className="px-6 py-3 text-right">
              <Button size="sm" variant="ghost">Bearbeiten</Button>
            </td>
          </tr>
        ))}
      </Table>
    </AdminCard>
  );
}

// ---- Cost centers ----------------------------------------------------------

function CostCentersTab() {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground max-w-xl">
        Kostenstellen sind reine Zuordnungs- und Reporting-Merkmale. Budgets werden auf Gruppenebene
        geführt, nicht auf einzelnen Kostenstellen.
      </p>
      <AdminCard
        title="Kostenstellen"
        action={
          <Button size="sm">
            <Plus className="size-3.5" /> Kostenstelle anlegen
          </Button>
        }
      >
        <Table headers={["Code", "Bezeichnung", "Status", ""]}>
          {costCenters.map((c) => (
            <tr key={c.id} className="border-t border-black/5">
              <td className="px-6 py-3 font-mono text-xs">{c.code}</td>
              <td className="px-6 py-3">{c.name}</td>
              <td className="px-6 py-3">
                <span className={cn("text-xs", c.active ? "text-success" : "text-muted-foreground")}>
                  {c.active ? "Aktiv" : "Inaktiv"}
                </span>
              </td>
              <td className="px-6 py-3 text-right">
                <Button size="sm" variant="ghost">Bearbeiten</Button>
              </td>
            </tr>
          ))}
        </Table>
      </AdminCard>
    </div>
  );
}

// ---- Cost-center groups (per project) --------------------------------------

function GroupsTab() {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const project = getProject(projectId);
  const groups = groupsForProject(projectId);

  const assignedIds = new Set(groups.flatMap((g) => g.costCenterIds));
  const unassigned = costCenters.filter((c) => !assignedIds.has(c.id));

  return (
    <div className="space-y-6">
      <div className="bg-card ring-1 ring-black/5 rounded-xl p-6 flex items-end gap-6">
        <div className="flex-1 max-w-md">
          <Label className="text-xs">Projekt wählen</Label>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {project && (
          <div className="text-xs text-muted-foreground">
            {groups.length} Gruppen · {assignedIds.size} zugeordnete Kostenstellen
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {groups.map((g) => (
          <div key={g.id} className="bg-card ring-1 ring-black/5 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading font-semibold text-sm">{g.name}</h3>
              <Button size="sm" variant="ghost" className="h-7 px-2">Umbenennen</Button>
            </div>
            <div className="space-y-1.5">
              {g.costCenterIds.map((id) => {
                const c = getCostCenter(id);
                return c ? (
                  <div
                    key={id}
                    className="flex items-center justify-between text-xs bg-secondary/60 rounded px-2.5 py-1.5"
                  >
                    <span>
                      <span className="font-mono">{c.code}</span> · {c.name}
                    </span>
                    <button
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      onClick={() => toast.info(`${c.name} entfernen (Demo)`)}
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ) : null;
              })}
              {g.costCenterIds.length === 0 && (
                <p className="text-xs text-muted-foreground italic">Noch keine Kostenstellen zugeordnet.</p>
              )}
            </div>
            <AssignPicker
              unassigned={unassigned}
              onPick={(cc) => toast.success(`${cc.name} → ${g.name} (Demo)`)}
            />
          </div>
        ))}

        <button
          onClick={() => toast.info("Neue Gruppe (Demo)")}
          className="rounded-xl border-2 border-dashed border-border p-5 min-h-40 grid place-items-center text-sm text-muted-foreground hover:border-navy-600/40 hover:text-navy-800 transition-colors"
        >
          <span className="inline-flex items-center gap-2">
            <Plus className="size-4" /> Neue Gruppe anlegen
          </span>
        </button>
      </div>

      {unassigned.length > 0 && (
        <div className="bg-warning/5 ring-1 ring-warning/20 rounded-xl p-5">
          <h3 className="font-heading font-semibold text-sm mb-2">
            Noch nicht zugeordnete Kostenstellen ({unassigned.length})
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            Diese Kostenstellen existieren im System, sind aber in diesem Projekt keiner Gruppe zugeordnet.
          </p>
          <div className="flex flex-wrap gap-2">
            {unassigned.map((c) => (
              <span
                key={c.id}
                className="text-xs bg-card rounded-full px-2.5 py-1 font-mono ring-1 ring-black/5"
              >
                {c.code} <span className="text-muted-foreground font-body">· {c.name}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AssignPicker({
  unassigned,
  onPick,
}: {
  unassigned: typeof costCenters;
  onPick: (c: (typeof costCenters)[number]) => void;
}) {
  const [open, setOpen] = useState(false);
  if (unassigned.length === 0) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="mt-3 w-full h-8 text-xs">
          <Plus className="size-3" /> Kostenstelle zuordnen
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Kostenstelle zuordnen</DialogTitle>
        </DialogHeader>
        <div className="max-h-80 overflow-y-auto space-y-1">
          {unassigned.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                onPick(c);
                setOpen(false);
              }}
              className="w-full text-left flex items-center justify-between px-3 py-2 rounded hover:bg-secondary transition-colors"
            >
              <span className="text-sm">
                <span className="font-mono">{c.code}</span> · {c.name}
              </span>
              <Check className="size-3.5 opacity-0" />
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---- Budget lines ----------------------------------------------------------

function BudgetLinesTab() {
  return (
    <AdminCard
      title="Budget-Zeilen"
      action={
        <Button size="sm">
          <Plus className="size-3.5" /> Budget-Zeile anlegen
        </Button>
      }
    >
      <Table headers={["Projekt", "Gruppe", "Zugewiesen", "Warnschwelle", ""]}>
        {budgetLines.map((b) => {
          const p = getProject(b.projectId);
          const g = costCenterGroups.find((x) => x.id === b.groupId);
          return (
            <tr key={b.id} className="border-t border-black/5">
              <td className="px-6 py-3">{p?.name}</td>
              <td className="px-6 py-3">{g?.name}</td>
              <td className="px-6 py-3 font-mono">{fmtEUR(b.allocated)}</td>
              <td className="px-6 py-3">{b.warningThresholdPct} %</td>
              <td className="px-6 py-3 text-right">
                <Button size="sm" variant="ghost">Bearbeiten</Button>
              </td>
            </tr>
          );
        })}
      </Table>
    </AdminCard>
  );
}

// ---- Partners --------------------------------------------------------------

function PartnersTab() {
  return (
    <AdminCard
      title="Partner"
      action={
        <Button size="sm">
          <Plus className="size-3.5" /> Partner anlegen
        </Button>
      }
    >
      <Table headers={["Name", "Kontakt", "Status", ""]}>
        {partners.map((p) => (
          <tr key={p.id} className="border-t border-black/5">
            <td className="px-6 py-3">{p.name}</td>
            <td className="px-6 py-3 text-muted-foreground">{p.contactEmail}</td>
            <td className="px-6 py-3">
              <span className={cn("text-xs", p.active ? "text-success" : "text-muted-foreground")}>
                {p.active ? "Aktiv" : "Inaktiv"}
              </span>
            </td>
            <td className="px-6 py-3 text-right">
              <Button size="sm" variant="ghost">Bearbeiten</Button>
            </td>
          </tr>
        ))}
      </Table>
    </AdminCard>
  );
}

// ---- Settings --------------------------------------------------------------

function SettingsTab() {
  return (
    <div className="space-y-3">
      {settingsData.map((s) => (
        <div key={s.key} className="bg-card ring-1 ring-black/5 rounded-xl p-5 flex items-center justify-between gap-6">
          <div>
            <div className="text-sm font-medium">{s.label}</div>
            <div className="text-[10px] font-mono text-muted-foreground mt-0.5">{s.key}</div>
          </div>
          <div>
            {typeof s.value === "boolean" ? (
              <Switch checked={s.value} disabled />
            ) : (
              <Input value={String(s.value)} readOnly className="w-40 font-mono text-right" />
            )}
          </div>
        </div>
      ))}
      <p className="text-xs text-muted-foreground max-w-xl mt-4">
        Systemeinstellungen werden hier vollständig angezeigt — auch dann, wenn sie aktuell nicht
        veränderbar sind. So bleibt der aktuelle Konfigurationsstand jederzeit sichtbar.
      </p>
    </div>
  );
}

// ---- Audit log -------------------------------------------------------------

function AuditTab() {
  const [filter, setFilter] = useState("");
  const filtered = filter
    ? auditLog.filter(
        (a) =>
          a.table.includes(filter.toLowerCase()) ||
          a.summary.toLowerCase().includes(filter.toLowerCase()),
      )
    : auditLog;

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Input
          placeholder="Nach Tabelle oder Änderung filtern…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-sm"
        />
      </div>
      <AdminCard title={`Änderungsprotokoll · ${filtered.length}`}>
        <Table headers={["Zeitpunkt", "Nutzer", "Tabelle", "Datensatz", "Aktion", "Änderung"]}>
          {filtered.map((a) => (
            <tr key={a.id} className="border-t border-black/5">
              <td className="px-6 py-3 text-xs text-muted-foreground font-mono whitespace-nowrap">
                {fmtDateTime(a.at)}
              </td>
              <td className="px-6 py-3">{getUser(a.actorUserId)?.name}</td>
              <td className="px-6 py-3 text-xs font-mono">{a.table}</td>
              <td className="px-6 py-3 text-xs font-mono text-muted-foreground">{a.recordId}</td>
              <td className="px-6 py-3">
                <span
                  className={cn(
                    "text-[10px] font-heading font-semibold uppercase tracking-wider px-2 py-0.5 rounded",
                    a.action === "insert" && "bg-success/10 text-success",
                    a.action === "update" && "bg-navy-100 text-navy-800",
                    a.action === "delete" && "bg-destructive/10 text-destructive",
                  )}
                >
                  {a.action}
                </span>
              </td>
              <td className="px-6 py-3 text-xs">{a.summary}</td>
            </tr>
          ))}
        </Table>
      </AdminCard>
      <p className="text-xs text-muted-foreground text-center">
        Nur Ansicht — Einträge können weder geändert noch gelöscht werden.
      </p>
    </div>
  );
}
