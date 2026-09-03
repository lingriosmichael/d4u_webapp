"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { useCurrentUser } from "@/lib/role-context";
import { fmtDateTime, fmtEUR, type Role } from "@/lib/mock-data";
import type {
  AdminUser,
  AdminProject,
  AdminCostCenter,
  AdminGroup,
  AdminBudgetLine,
  AdminPartner,
  AdminSetting,
  AdminAuditLogEntry,
} from "@/lib/supabase/queries/admin";
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
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { AdminFormDialog, type AdminField } from "./admin-form-dialog";
import { callBackend, BackendError } from "@/lib/api";

// Reads: real Supabase, fetched server-side by page.tsx and passed down as
// props (same pattern as Übersicht/Expense Detail). Writes: real
// d4u_backend calls via AdminFormDialog (./admin-form-dialog.tsx), one
// generic create/edit dialog reused across every tab instead of six
// bespoke forms. The Settings and Protokoll tabs stay read-only by
// design — see SettingsTab's own copy ("auch dann, wenn sie aktuell nicht
// veränderbar sind") and AuditTab's ("Nur Ansicht").
export function AdminPage({
  users,
  projects,
  costCenters,
  groups,
  budgetLines,
  partners,
  settings,
  auditLog,
}: {
  users: AdminUser[];
  projects: AdminProject[];
  costCenters: AdminCostCenter[];
  groups: AdminGroup[];
  budgetLines: AdminBudgetLine[];
  partners: AdminPartner[];
  settings: AdminSetting[];
  auditLog: AdminAuditLogEntry[];
}) {
  const { user } = useCurrentUser();
  const router = useRouter();

  useEffect(() => {
    if (user.role !== "admin") router.replace("/");
  }, [user.role, router]);

  if (user.role !== "admin") {
    return (
      <PageContainer>
        <PageHeader
          eyebrow="Zugriff verweigert"
          title="Sie haben keinen Zugriff auf die Administration"
          description="Diese Ansicht ist ausschließlich für Administrator:innen. Wenden Sie sich bitte an Ihre Administration, falls Sie hier Zugriff benötigen."
        />
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
          <TabsTrigger value="users" className="text-xs">
            Nutzer
          </TabsTrigger>
          <TabsTrigger value="projects" className="text-xs">
            Projekte
          </TabsTrigger>
          <TabsTrigger value="cc" className="text-xs">
            Kostenstellen
          </TabsTrigger>
          <TabsTrigger value="groups" className="text-xs">
            Gruppen
          </TabsTrigger>
          <TabsTrigger value="budget" className="text-xs">
            Budgets
          </TabsTrigger>
          <TabsTrigger value="partners" className="text-xs">
            Partner
          </TabsTrigger>
          <TabsTrigger value="settings" className="text-xs">
            Einstellungen
          </TabsTrigger>
          <TabsTrigger value="audit" className="text-xs">
            Protokoll
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-6">
          <UsersTab users={users} />
        </TabsContent>
        <TabsContent value="projects" className="mt-6">
          <ProjectsTab projects={projects} users={users} />
        </TabsContent>
        <TabsContent value="cc" className="mt-6">
          <CostCentersTab costCenters={costCenters} />
        </TabsContent>
        <TabsContent value="groups" className="mt-6">
          <GroupsTab projects={projects} groups={groups} costCenters={costCenters} />
        </TabsContent>
        <TabsContent value="budget" className="mt-6">
          <BudgetLinesTab budgetLines={budgetLines} projects={projects} groups={groups} />
        </TabsContent>
        <TabsContent value="partners" className="mt-6">
          <PartnersTab partners={partners} />
        </TabsContent>
        <TabsContent value="settings" className="mt-6">
          <SettingsTab settings={settings} />
        </TabsContent>
        <TabsContent value="audit" className="mt-6">
          <AuditTab auditLog={auditLog} />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}

// ---- Helpers ---------------------------------------------------------------

function AdminCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
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
            <th key={h} className="text-left px-6 py-3">
              {h}
            </th>
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

const ROLE_OPTIONS = (Object.keys(roleLabels) as Role[]).map((r) => ({
  value: r,
  label: roleLabels[r],
}));

const USER_EDIT_FIELDS: AdminField[] = [
  { key: "email", label: "E-Mail", type: "email", required: true },
  { key: "first_name", label: "Vorname", type: "text", required: true },
  { key: "last_name", label: "Nachname", type: "text", required: true },
  { key: "role", label: "Rolle", type: "select", options: ROLE_OPTIONS, required: true },
];

// "id" is caller-supplied on create — it must be an existing auth.users
// UUID (Supabase Auth account created via the dashboard first), since this
// backend has no route to create Auth users itself. See
// d4u_backend/src/lib/admin-resources.ts's callerSuppliesId flag.
const USER_CREATE_FIELDS: AdminField[] = [
  { key: "id", label: "Auth-Konto-ID (aus Supabase Dashboard)", type: "text", required: true },
  ...USER_EDIT_FIELDS,
];

function UsersTab({ users }: { users: AdminUser[] }) {
  return (
    <AdminCard
      title="Nutzer"
      action={
        <AdminFormDialog
          title="Nutzer anlegen"
          endpoint="admin.users.upsert"
          fields={USER_CREATE_FIELDS}
          initial={{ role: "project_manager" }}
          trigger={
            <Button size="sm">
              <Plus className="size-3.5" /> Nutzer anlegen
            </Button>
          }
        />
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
            <td className="px-6 py-3 text-right space-x-1">
              <DeactivateUserButton user={u} />
              <AdminFormDialog
                title="Nutzer bearbeiten"
                endpoint="admin.users.upsert"
                fields={USER_EDIT_FIELDS}
                recordId={u.id}
                initial={{
                  email: u.email,
                  first_name: u.name.split(" ")[0] ?? "",
                  last_name: u.name.split(" ").slice(1).join(" "),
                  role: u.role,
                }}
                trigger={
                  <Button size="sm" variant="ghost">
                    Bearbeiten
                  </Button>
                }
              />
            </td>
          </tr>
        ))}
      </Table>
    </AdminCard>
  );
}

// Deactivating a user is its own explicit, confirmed action — deliberately
// separate from the generic edit dialog above, per this frontend's own
// rule (deactivation has real access-control consequences: it should block
// the user's JWT at the backend, not just hide them from a dropdown).
function DeactivateUserButton({ user }: { user: AdminUser }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const nextActive = !user.active;

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await callBackend("admin.users.setActive", { id: user.id, active: nextActive });
      toast.success(nextActive ? "Konto aktiviert" : "Konto deaktiviert");
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error("Aktion fehlgeschlagen", {
        description:
          error instanceof BackendError ? error.message : "Bitte versuchen Sie es erneut.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          {user.active ? "Deaktivieren" : "Aktivieren"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{user.active ? "Konto deaktivieren" : "Konto aktivieren"}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {user.active
            ? `${user.name} verliert damit sofort den Zugriff — auch ein bereits laufendes Login wird beim nächsten Aufruf abgelehnt.`
            : `${user.name} erhält damit wieder Zugriff auf D4U Finance.`}
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Abbrechen
          </Button>
          <Button
            variant={user.active ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={submitting}
          >
            {user.active ? "Deaktivieren" : "Aktivieren"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Projects --------------------------------------------------------------

// Verified against the live projects_status_check constraint.
const PROJECT_STATUS_OPTIONS = [
  { value: "active", label: "Aktiv" },
  { value: "closed", label: "Abgeschlossen" },
  { value: "on_hold", label: "Pausiert" },
];

function ProjectsTab({ projects, users }: { projects: AdminProject[]; users: AdminUser[] }) {
  const projectFields: AdminField[] = [
    { key: "code", label: "Code", type: "text", required: true },
    { key: "name", label: "Name", type: "text", required: true },
    { key: "funding_program", label: "Förderprogramm", type: "text" },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: PROJECT_STATUS_OPTIONS,
      required: true,
    },
    {
      key: "lead_user_id",
      label: "Leitung",
      type: "select",
      options: users.map((u) => ({ value: u.id, label: u.name })),
    },
    { key: "start_date", label: "Start", type: "date" },
    { key: "end_date", label: "Ende", type: "date" },
  ];

  return (
    <AdminCard
      title="Projekte"
      action={
        <AdminFormDialog
          title="Projekt anlegen"
          endpoint="admin.projects.upsert"
          fields={projectFields}
          initial={{ status: "active" }}
          trigger={
            <Button size="sm">
              <Plus className="size-3.5" /> Projekt anlegen
            </Button>
          }
        />
      }
    >
      <Table headers={["Code", "Name", "Förderprogramm", "Leitung", "Zeitraum", ""]}>
        {projects.map((p) => (
          <tr key={p.id} className="border-t border-black/5">
            <td className="px-6 py-3 font-mono text-xs">{p.code}</td>
            <td className="px-6 py-3">{p.name}</td>
            <td className="px-6 py-3 text-muted-foreground">{p.fundingProgram}</td>
            <td className="px-6 py-3 text-muted-foreground">{p.leadUserName ?? "—"}</td>
            <td className="px-6 py-3 text-xs text-muted-foreground">
              {p.startDate} – {p.endDate}
            </td>
            <td className="px-6 py-3 text-right">
              <AdminFormDialog
                title="Projekt bearbeiten"
                endpoint="admin.projects.upsert"
                fields={projectFields}
                recordId={p.id}
                initial={{
                  code: p.code,
                  name: p.name,
                  funding_program: p.fundingProgram ?? "",
                  status: p.status,
                  lead_user_id: p.leadUserId ?? "",
                  start_date: p.startDate ?? "",
                  end_date: p.endDate ?? "",
                }}
                trigger={
                  <Button size="sm" variant="ghost">
                    Bearbeiten
                  </Button>
                }
              />
            </td>
          </tr>
        ))}
      </Table>
    </AdminCard>
  );
}

// ---- Cost centers ----------------------------------------------------------

const COST_CENTER_FIELDS: AdminField[] = [
  { key: "code", label: "Code", type: "text", required: true },
  { key: "name", label: "Bezeichnung", type: "text", required: true },
  { key: "active", label: "Aktiv", type: "switch" },
];

function CostCentersTab({ costCenters }: { costCenters: AdminCostCenter[] }) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground max-w-xl">
        Kostenstellen sind reine Zuordnungs- und Reporting-Merkmale. Budgets werden auf Gruppenebene
        geführt, nicht auf einzelnen Kostenstellen.
      </p>
      <AdminCard
        title="Kostenstellen"
        action={
          <AdminFormDialog
            title="Kostenstelle anlegen"
            endpoint="admin.costCenters.upsert"
            fields={COST_CENTER_FIELDS}
            initial={{ active: true }}
            trigger={
              <Button size="sm">
                <Plus className="size-3.5" /> Kostenstelle anlegen
              </Button>
            }
          />
        }
      >
        <Table headers={["Code", "Bezeichnung", "Status", ""]}>
          {costCenters.map((c) => (
            <tr key={c.id} className="border-t border-black/5">
              <td className="px-6 py-3 font-mono text-xs">{c.code}</td>
              <td className="px-6 py-3">{c.name}</td>
              <td className="px-6 py-3">
                <span
                  className={cn("text-xs", c.active ? "text-success" : "text-muted-foreground")}
                >
                  {c.active ? "Aktiv" : "Inaktiv"}
                </span>
              </td>
              <td className="px-6 py-3 text-right">
                <AdminFormDialog
                  title="Kostenstelle bearbeiten"
                  endpoint="admin.costCenters.upsert"
                  fields={COST_CENTER_FIELDS}
                  recordId={c.id}
                  initial={{ code: c.code, name: c.name, active: c.active }}
                  trigger={
                    <Button size="sm" variant="ghost">
                      Bearbeiten
                    </Button>
                  }
                />
              </td>
            </tr>
          ))}
        </Table>
      </AdminCard>
    </div>
  );
}

// ---- Cost-center groups (per project) --------------------------------------

function GroupsTab({
  projects,
  groups,
  costCenters,
}: {
  projects: AdminProject[];
  groups: AdminGroup[];
  costCenters: AdminCostCenter[];
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const project = projects.find((p) => p.id === projectId);
  const projectGroups = groups.filter((g) => g.projectId === projectId);

  const assignedIds = new Set(projectGroups.flatMap((g) => g.costCenterIds));
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
            {projectGroups.length} Gruppen · {assignedIds.size} zugeordnete Kostenstellen
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {projectGroups.map((g) => (
          <div key={g.id} className="bg-card ring-1 ring-black/5 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading font-semibold text-sm">{g.name}</h3>
              <AdminFormDialog
                title="Gruppe umbenennen"
                endpoint="admin.groups.upsert"
                fields={[{ key: "name", label: "Name", type: "text", required: true }]}
                recordId={g.id}
                initial={{ name: g.name }}
                trigger={
                  <Button size="sm" variant="ghost" className="h-7 px-2">
                    Umbenennen
                  </Button>
                }
              />
            </div>
            <div className="space-y-1.5">
              {g.costCenterIds.map((id) => {
                const c = costCenters.find((cc) => cc.id === id);
                return c ? <RemoveCostCenterRow key={id} costCenter={c} groupId={g.id} /> : null;
              })}
              {g.costCenterIds.length === 0 && (
                <p className="text-xs text-muted-foreground italic">
                  Noch keine Kostenstellen zugeordnet.
                </p>
              )}
            </div>
            <AssignPicker groupId={g.id} groupName={g.name} unassigned={unassigned} />
          </div>
        ))}

        <AdminFormDialog
          title="Neue Gruppe anlegen"
          endpoint="admin.groups.upsert"
          fields={[{ key: "name", label: "Name", type: "text", required: true }]}
          initial={{ project_id: projectId, name: "" }}
          trigger={
            <button
              disabled={!projectId}
              className="rounded-xl border-2 border-dashed border-border p-5 min-h-40 grid place-items-center text-sm text-muted-foreground hover:border-navy-600/40 hover:text-navy-800 transition-colors disabled:opacity-50"
            >
              <span className="inline-flex items-center gap-2">
                <Plus className="size-4" /> Neue Gruppe anlegen
              </span>
            </button>
          }
        />
      </div>

      {unassigned.length > 0 && (
        <div className="bg-warning/5 ring-1 ring-warning/20 rounded-xl p-5">
          <h3 className="font-heading font-semibold text-sm mb-2">
            Noch nicht zugeordnete Kostenstellen ({unassigned.length})
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            Diese Kostenstellen existieren im System, sind aber in diesem Projekt keiner Gruppe
            zugeordnet.
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

function RemoveCostCenterRow({
  costCenter,
  groupId,
}: {
  costCenter: AdminCostCenter;
  groupId: string;
}) {
  const router = useRouter();
  const [removing, setRemoving] = useState(false);

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await callBackend("admin.groups.setMembership", {
        groupId,
        costCenterId: costCenter.id,
        action: "remove",
      });
      router.refresh();
    } catch (error) {
      toast.error("Konnte nicht entfernen", {
        description:
          error instanceof BackendError ? error.message : "Bitte versuchen Sie es erneut.",
      });
      setRemoving(false);
    }
  };

  return (
    <div className="flex items-center justify-between text-xs bg-secondary/60 rounded px-2.5 py-1.5">
      <span>
        <span className="font-mono">{costCenter.code}</span> · {costCenter.name}
      </span>
      <button
        className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
        onClick={handleRemove}
        disabled={removing}
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

function AssignPicker({
  groupId,
  groupName,
  unassigned,
}: {
  groupId: string;
  groupName: string;
  unassigned: AdminCostCenter[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  if (unassigned.length === 0) return null;

  const handlePick = async (c: AdminCostCenter) => {
    try {
      await callBackend("admin.groups.setMembership", { groupId, costCenterId: c.id });
      toast.success(`${c.name} → ${groupName}`);
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error("Konnte nicht zuordnen", {
        description:
          error instanceof BackendError ? error.message : "Bitte versuchen Sie es erneut.",
      });
    }
  };

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
              onClick={() => handlePick(c)}
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

function BudgetLinesTab({
  budgetLines,
  projects,
  groups,
}: {
  budgetLines: AdminBudgetLine[];
  projects: AdminProject[];
  groups: AdminGroup[];
}) {
  // Groups are labeled with their project's code so an admin can pick the
  // right one without a cascading/dependent select — this dialog is
  // generic and doesn't support that, and a two-step picker wasn't worth
  // building for a field admins fill in rarely.
  const groupOptions = groups.map((g) => {
    const project = projects.find((p) => p.id === g.projectId);
    return { value: g.id, label: `${project?.code ?? "?"} — ${g.name}` };
  });

  const createFields: AdminField[] = [
    {
      key: "project_id",
      label: "Projekt",
      type: "select",
      required: true,
      options: projects.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` })),
    },
    {
      key: "group_id",
      label: "Kostenstellen-Gruppe",
      type: "select",
      required: true,
      options: groupOptions,
    },
    {
      key: "allocated_amount",
      label: "Zugewiesenes Budget (EUR)",
      type: "number",
      step: "0.01",
      required: true,
    },
    { key: "warning_threshold_pct", label: "Warnschwelle (%)", type: "number", required: true },
  ];

  // Editable fields only: allocated_amount / warning_threshold_pct, per
  // this frontend's own rule that consumed_amount/obligo_amount are
  // RPC-owned and project/group reassignment isn't an admin-edit feature.
  const editFields: AdminField[] = [
    {
      key: "allocated_amount",
      label: "Zugewiesenes Budget (EUR)",
      type: "number",
      step: "0.01",
      required: true,
    },
    { key: "warning_threshold_pct", label: "Warnschwelle (%)", type: "number", required: true },
  ];

  return (
    <AdminCard
      title="Budget-Zeilen"
      action={
        <AdminFormDialog
          title="Budget-Zeile anlegen"
          endpoint="admin.budgets.upsert"
          fields={createFields}
          initial={{ warning_threshold_pct: 80 }}
          trigger={
            <Button size="sm">
              <Plus className="size-3.5" /> Budget-Zeile anlegen
            </Button>
          }
        />
      }
    >
      <Table headers={["Projekt", "Gruppe", "Zugewiesen", "Warnschwelle", ""]}>
        {budgetLines.map((b) => (
          <tr key={b.id} className="border-t border-black/5">
            <td className="px-6 py-3">{b.projectName}</td>
            <td className="px-6 py-3">{b.groupName}</td>
            <td className="px-6 py-3 font-mono">{fmtEUR(b.allocated)}</td>
            <td className="px-6 py-3">{b.warningThresholdPct} %</td>
            <td className="px-6 py-3 text-right">
              <AdminFormDialog
                title="Budget-Zeile bearbeiten"
                endpoint="admin.budgets.upsert"
                fields={editFields}
                recordId={b.id}
                initial={{
                  allocated_amount: b.allocated,
                  warning_threshold_pct: b.warningThresholdPct,
                }}
                trigger={
                  <Button size="sm" variant="ghost">
                    Bearbeiten
                  </Button>
                }
              />
            </td>
          </tr>
        ))}
      </Table>
    </AdminCard>
  );
}

// ---- Partners --------------------------------------------------------------

const PARTNER_FIELDS: AdminField[] = [
  { key: "name", label: "Name", type: "text", required: true },
  { key: "contact_email", label: "Kontakt (E-Mail)", type: "email" },
  { key: "active", label: "Aktiv", type: "switch" },
];

function PartnersTab({ partners }: { partners: AdminPartner[] }) {
  return (
    <AdminCard
      title="Partner"
      action={
        <AdminFormDialog
          title="Partner anlegen"
          endpoint="admin.partners.upsert"
          fields={PARTNER_FIELDS}
          initial={{ active: true }}
          trigger={
            <Button size="sm">
              <Plus className="size-3.5" /> Partner anlegen
            </Button>
          }
        />
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
              <AdminFormDialog
                title="Partner bearbeiten"
                endpoint="admin.partners.upsert"
                fields={PARTNER_FIELDS}
                recordId={p.id}
                initial={{ name: p.name, contact_email: p.contactEmail ?? "", active: p.active }}
                trigger={
                  <Button size="sm" variant="ghost">
                    Bearbeiten
                  </Button>
                }
              />
            </td>
          </tr>
        ))}
      </Table>
    </AdminCard>
  );
}

// ---- Settings --------------------------------------------------------------

// Display labels aren't stored in the `settings` table (just key/value) —
// kept here as presentation only, same as the original mock fixture had
// them, not as a stand-in for real data.
const SETTING_LABELS: Record<string, string> = {
  ceo_approval_threshold_eur: "Freigabegrenze für Eskalation an die Geschäftsführung (EUR)",
  warning_threshold_pct: "Standard-Warnschwelle Budgetauslastung (%)",
  advance_requires_ceo_approval: "Vorschuss benötigt CEO-Freigabe",
  notify_slack_channel: "Benachrichtigungs-Kanal (RocketChat)",
  vat_default_rate: "Standard-USt-Satz (%)",
};

function SettingsTab({ settings }: { settings: AdminSetting[] }) {
  return (
    <div className="space-y-3">
      {settings.map((s) => (
        <div
          key={s.key}
          className="bg-card ring-1 ring-black/5 rounded-xl p-5 flex items-center justify-between gap-6"
        >
          <div>
            <div className="text-sm font-medium">{SETTING_LABELS[s.key] ?? s.key}</div>
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

function AuditTab({ auditLog }: { auditLog: AdminAuditLogEntry[] }) {
  const [filter, setFilter] = useState("");
  const filtered = filter
    ? auditLog.filter(
        (a) =>
          a.table.toLowerCase().includes(filter.toLowerCase()) ||
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
              <td className="px-6 py-3">{a.actorName ?? "—"}</td>
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
