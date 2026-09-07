"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageContainer, PageHeader } from "@/components/layout/app-shell";
import { useCurrentUser } from "@/lib/role-context";
import { fmtDateTime, fmtEUR, roleLabels, type Role } from "@/lib/mock-data";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, X, Check, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { AdminFormDialog, type AdminField } from "./admin-form-dialog";
import { callBackend, BackendError, type BackendEndpoint } from "@/lib/api";

const adminTabTriggerClassName =
  "relative h-14 rounded-none px-0 py-0 text-sm font-medium text-stone shadow-none transition-colors hover:text-ink data-[state=active]:bg-transparent data-[state=active]:text-ink data-[state=active]:font-semibold data-[state=active]:shadow-none after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-transparent data-[state=active]:after:bg-clay";

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
  const visibleSettings = settings.filter((s) => !SUPERSEDED_SETTING_KEYS.has(s.key));
  // Every setting here is display-only (see SettingsTab) — a whole tab
  // for a single inert toggle isn't worth the click. Reappears on its own
  // once a second real setting exists.
  const showSettingsTab = visibleSettings.length > 1;

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
        <div className="sticky top-0 z-10 -mx-8 bg-shell px-8 pt-4">
          <div className="overflow-x-auto">
            <TabsList className="flex h-14 w-max min-w-full items-stretch justify-start gap-10 rounded-none border-b border-line bg-transparent p-0 text-stone">
              <TabsTrigger value="users" className={adminTabTriggerClassName}>
                Nutzer
              </TabsTrigger>
              <TabsTrigger value="projects" className={adminTabTriggerClassName}>
                Projekte
              </TabsTrigger>
              <TabsTrigger value="cc" className={adminTabTriggerClassName}>
                Kostenstellen
              </TabsTrigger>
              <TabsTrigger value="groups" className={adminTabTriggerClassName}>
                Gruppen &amp; Budgets
              </TabsTrigger>
              <TabsTrigger value="partners" className={adminTabTriggerClassName}>
                Partner
              </TabsTrigger>
              {showSettingsTab && (
                <TabsTrigger value="settings" className={adminTabTriggerClassName}>
                  Einstellungen
                </TabsTrigger>
              )}
              <TabsTrigger value="audit" className={adminTabTriggerClassName}>
                Protokoll
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        <TabsContent value="users" className="mt-8">
          <UsersTab users={users} />
        </TabsContent>
        <TabsContent value="projects" className="mt-8">
          <ProjectsTab projects={projects} users={users} />
        </TabsContent>
        <TabsContent value="cc" className="mt-8">
          <CostCentersTab costCenters={costCenters} />
        </TabsContent>
        <TabsContent value="groups" className="mt-8">
          <GroupsTab
            projects={projects}
            groups={groups}
            costCenters={costCenters}
            budgetLines={budgetLines}
          />
        </TabsContent>
        <TabsContent value="partners" className="mt-8">
          <PartnersTab partners={partners} />
        </TabsContent>
        {showSettingsTab && (
          <TabsContent value="settings" className="mt-8">
            <SettingsTab settings={visibleSettings} />
          </TabsContent>
        )}
        <TabsContent value="audit" className="mt-8">
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
    <div className="bg-card ring-1 ring-line card-shape overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-line">
        <h2 className="font-semibold text-sm">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function Table({
  headers,
  widths,
  children,
}: {
  headers: string[];
  /** Optional per-column width (e.g. "18%"). Switches to table-layout:
   * fixed so the percentages (and any `truncate` cell content) actually
   * hold — tables that don't pass this keep the old auto-sizing behavior,
   * so this is opt-in per tab, not a global layout change. */
  widths?: string[];
  children: React.ReactNode;
}) {
  return (
    // overflow-x-auto is a narrow-viewport safety net, not the answer to a
    // too-wide actions column — that's solved per-tab (see UsersTab's
    // compact "Bearbeiten ⋯" pattern) by keeping the actions column
    // genuinely narrow, not by relying on this to scroll it into view.
    <div className="overflow-x-auto">
      <table className={cn("w-full text-sm", widths && "table-fixed")}>
        <thead className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground bg-secondary/40">
          <tr>
            {headers.map((h, i) => (
              <th
                key={h}
                className="text-left px-6 py-3 whitespace-nowrap"
                style={widths ? { width: widths[i] } : undefined}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

// Shared row-action layout for every tab below: routine actions (Bearbeiten,
// Deaktivieren) grouped together, then a hairline divider, then the
// destructive action — a standard admin-table pattern that keeps "Löschen"
// from sitting flush against "Bearbeiten" with no visual distinction (both
// are ghost-text buttons of equal weight otherwise, one misclick apart).
function RowActions({
  children,
  destructive,
}: {
  children: React.ReactNode;
  destructive: React.ReactNode;
}) {
  return (
    <div className="inline-flex items-center gap-2">
      {children}
      <div className="border-l border-line pl-2">{destructive}</div>
    </div>
  );
}

// Generic delete-with-confirmation button, reused across every tab below.
// Mirrors DeactivateUserButton's confirm-dialog shape. The backend performs
// a hard delete backed by the database's own foreign-key constraints (see
// d4u_backend's DELETE /api/admin/[resource]/[id]) — if the record is still
// referenced elsewhere (e.g. a cost center still assigned to a group, a
// user with expense history), the backend rejects it with a German error
// message this button surfaces via toast rather than silently cascading.
function DeleteButton({
  endpoint,
  id,
  confirmTitle,
  confirmDescription,
  className,
  renderTrigger,
}: {
  endpoint: BackendEndpoint;
  id: string;
  confirmTitle: string;
  confirmDescription: string;
  className?: string;
  /** For use inside a DropdownMenu — a nested DialogTrigger inside a
   * DropdownMenuItem fights the menu's own close/focus-return, so instead
   * this hands the caller an `open()` callback to wire up itself (see
   * UsersTab). Falls back to the default standalone ghost button. */
  renderTrigger?: (open: () => void) => React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await callBackend(endpoint, { id });
      toast.success("Gelöscht");
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error("Löschen fehlgeschlagen", {
        description:
          error instanceof BackendError ? error.message : "Bitte versuchen Sie es erneut.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {renderTrigger ? (
        renderTrigger(() => setOpen(true))
      ) : (
        <DialogTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className={cn("text-destructive hover:text-destructive", className)}
          >
            Löschen
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{confirmTitle}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{confirmDescription}</p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Abbrechen
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={submitting}>
            Löschen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Users -----------------------------------------------------------------

const ROLE_OPTIONS = (Object.keys(roleLabels) as Role[]).map((r) => ({
  value: r,
  label: roleLabels[r],
}));

// Shared by create and edit. Deliberately excludes "email" — the backend
// (src/lib/admin-resources.ts) no longer accepts email as PATCH-writable,
// since changing it here would desync from the Supabase Auth account that
// owns it. Email is set once, at creation, via USER_CREATE_FIELDS below.
const USER_PROFILE_FIELDS: AdminField[] = [
  { key: "first_name", label: "Vorname", type: "text", required: true },
  { key: "last_name", label: "Nachname", type: "text", required: true },
  { key: "role", label: "Rolle", type: "select", options: ROLE_OPTIONS, required: true },
  // Added 2026-09-05 (documentation/approval_routing.md §2): a SUBMITTER
  // attribute, not an approver attribute — the amount above which this
  // user's own submissions additionally require CEO review before
  // Accounting. Leave blank on create to fall back to the database default
  // (0 — every submission by this user escalates to CEO, the fail-closed
  // default), editable afterward here.
  { key: "approval_limit", label: "Freigabegrenze (EUR)", type: "number", step: "0.01" },
];

// The backend's dedicated POST /api/admin/users route creates the
// Supabase Auth account itself and provisions this temp password —
// no manual Dashboard step or UUID copy-paste required. The admin shares
// this password with the new employee out-of-band; there's no
// invite-by-email flow yet (would need a configured email provider).
const USER_CREATE_FIELDS: AdminField[] = [
  { key: "email", label: "E-Mail", type: "email", required: true },
  ...USER_PROFILE_FIELDS,
  { key: "password", label: "Passwort (temporär)", type: "password", required: true },
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
      <Table
        headers={["Name", "E-Mail", "Rolle", "Freigabegrenze", "Status", "Aktionen"]}
        widths={["18%", "27%", "16%", "14%", "10%", "15%"]}
      >
        {users.map((u) => (
          <tr key={u.id} className="border-t border-line">
            <td className="px-6 py-3">
              <div className="flex items-center gap-3">
                <div className="size-8 shrink-0 rounded-full bg-accent grid place-items-center text-[10px] font-semibold text-ink">
                  {u.initials}
                </div>
                <span className="break-words">{u.name}</span>
              </div>
            </td>
            <td className="px-6 py-3 text-muted-foreground">
              <span className="block truncate" title={u.email}>
                {u.email}
              </span>
            </td>
            <td className="px-6 py-3">{roleLabels[u.role]}</td>
            <td className="px-6 py-3 font-mono whitespace-nowrap">{fmtEUR(u.approvalLimit)}</td>
            <td className="px-6 py-3">
              <span className={cn("text-xs", u.active ? "text-success" : "text-muted-foreground")}>
                {u.active ? "Aktiv" : "Deaktiviert"}
              </span>
            </td>
            <td className="px-6 py-3">
              <div className="flex items-center justify-end gap-1">
                <AdminFormDialog
                  title="Nutzer bearbeiten"
                  endpoint="admin.users.upsert"
                  fields={USER_PROFILE_FIELDS}
                  recordId={u.id}
                  initial={{
                    first_name: u.firstName,
                    last_name: u.lastName,
                    role: u.role,
                    approval_limit: u.approvalLimit,
                  }}
                  trigger={
                    <Button size="sm" variant="ghost">
                      Bearbeiten
                    </Button>
                  }
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-9 text-stone hover:bg-shell hover:text-ink focus-visible:ring-clay/35"
                    >
                      <MoreHorizontal className="size-4" />
                      <span className="sr-only">Weitere Aktionen für {u.name}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DeactivateUserButton
                      user={u}
                      renderTrigger={(open) => (
                        <DropdownMenuItem
                          onSelect={(e) => {
                            e.preventDefault();
                            open();
                          }}
                        >
                          {u.active ? "Deaktivieren" : "Aktivieren"}
                        </DropdownMenuItem>
                      )}
                    />
                    <DropdownMenuSeparator />
                    <DeleteButton
                      endpoint="admin.users.delete"
                      id={u.id}
                      confirmTitle="Nutzer löschen"
                      confirmDescription={`${u.name} wird endgültig gelöscht. Dies ist nur möglich, wenn keine Belege, Freigaben oder Projektleitungen mehr auf dieses Konto verweisen — andernfalls verwenden Sie stattdessen „Deaktivieren“.`}
                      renderTrigger={(open) => (
                        <DropdownMenuItem
                          onSelect={(e) => {
                            e.preventDefault();
                            open();
                          }}
                          className="text-destructive focus:text-destructive focus:bg-destructive/10"
                        >
                          Löschen
                        </DropdownMenuItem>
                      )}
                    />
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
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
//
// Deliberately NOT styled as a destructive confirmation (no red button, no
// "destructive" dialog tone) — it's fully reversible via "Aktivieren", so
// treating it with the same visual weight as the permanent "Löschen"
// action would be crying wolf on every single deactivation.
function DeactivateUserButton({
  user,
  renderTrigger,
}: {
  user: AdminUser;
  /** For use inside a DropdownMenu — see DeleteButton's renderTrigger doc. */
  renderTrigger?: (open: () => void) => React.ReactNode;
}) {
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
      {renderTrigger ? (
        renderTrigger(() => setOpen(true))
      ) : (
        <DialogTrigger asChild>
          <Button size="sm" variant="ghost">
            {user.active ? "Deaktivieren" : "Aktivieren"}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{user.active ? "Nutzer deaktivieren?" : "Nutzer aktivieren?"}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {user.active
            ? `${user.name} kann sich anschließend nicht mehr anmelden. Dies lässt sich jederzeit über „Aktivieren“ rückgängig machen.`
            : `${user.name} erhält damit wieder Zugriff auf D4U Finance.`}
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleConfirm} disabled={submitting}>
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
          <tr key={p.id} className="border-t border-line">
            <td className="px-6 py-3 font-mono text-xs">{p.code}</td>
            <td className="px-6 py-3">{p.name}</td>
            <td className="px-6 py-3 text-muted-foreground">{p.fundingProgram}</td>
            <td className="px-6 py-3 text-muted-foreground">{p.leadUserName ?? "—"}</td>
            <td className="px-6 py-3 text-xs text-muted-foreground">
              {p.startDate} – {p.endDate}
            </td>
            <td className="px-6 py-3 text-right">
              <RowActions
                destructive={
                  <DeleteButton
                    endpoint="admin.projects.delete"
                    id={p.id}
                    confirmTitle="Projekt löschen"
                    confirmDescription={`${p.name} wird endgültig gelöscht. Dies ist nur möglich, wenn keine Belege, Kostenstellen-Gruppen oder Budget-Zeilen mehr auf dieses Projekt verweisen.`}
                  />
                }
              >
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
              </RowActions>
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
            <tr key={c.id} className="border-t border-line">
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
                <RowActions
                  destructive={
                    <DeleteButton
                      endpoint="admin.costCenters.delete"
                      id={c.id}
                      confirmTitle="Kostenstelle löschen"
                      confirmDescription={`${c.name} wird endgültig gelöscht. Dies ist nur möglich, wenn sie keiner Gruppe mehr zugeordnet ist und keine Belege mehr auf sie verweisen.`}
                    />
                  }
                >
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
                </RowActions>
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
  budgetLines,
}: {
  projects: AdminProject[];
  groups: AdminGroup[];
  costCenters: AdminCostCenter[];
  budgetLines: AdminBudgetLine[];
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const project = projects.find((p) => p.id === projectId);
  const projectGroups = groups.filter((g) => g.projectId === projectId);
  const budgetLineByGroupId = new Map(budgetLines.map((b) => [b.groupId, b]));

  const assignedIds = new Set(projectGroups.flatMap((g) => g.costCenterIds));
  const unassigned = costCenters.filter((c) => !assignedIds.has(c.id));

  return (
    <div className="space-y-6">
      <div className="bg-card ring-1 ring-line card-shape p-6 flex items-end gap-6">
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
        {projectGroups.map((g) => {
          const budgetLine = budgetLineByGroupId.get(g.id);
          return (
            <div key={g.id} className="bg-card ring-1 ring-line card-shape p-5">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-semibold text-sm">{g.name}</h3>
                <RowActions
                  destructive={
                    <GroupDeleteButton group={g} budgetLine={budgetLine} className="h-7 px-2" />
                  }
                >
                  <GroupFormDialog
                    mode="edit"
                    projectId={projectId}
                    group={g}
                    budgetLine={budgetLine}
                    trigger={
                      <Button size="sm" variant="ghost" className="h-7 px-2">
                        Bearbeiten
                      </Button>
                    }
                  />
                </RowActions>
              </div>
              {budgetLine ? (
                <p className="text-xs text-muted-foreground mb-4">
                  Budget: <span className="font-mono">{fmtEUR(budgetLine.allocated)}</span> ·
                  Warnschwelle {budgetLine.warningThresholdPct}&nbsp;%
                </p>
              ) : (
                <p className="text-xs text-warning mb-4">Kein Budget hinterlegt</p>
              )}
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
          );
        })}

        <GroupFormDialog
          mode="create"
          projectId={projectId}
          trigger={
            <button
              disabled={!projectId}
              className="card-shape border-2 border-dashed border-border p-5 min-h-40 grid place-items-center text-sm text-muted-foreground hover:border-clay/40 hover:text-ember transition-colors disabled:opacity-50"
            >
              <span className="inline-flex items-center gap-2">
                <Plus className="size-4" /> Neue Gruppe anlegen
              </span>
            </button>
          }
        />
      </div>

      {unassigned.length > 0 && (
        <div className="bg-warning/5 ring-1 ring-warning/20 card-shape p-5">
          <h3 className="font-semibold text-sm mb-2">
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
                className="text-xs bg-card rounded-full px-2.5 py-1 font-mono ring-1 ring-line"
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

// A cost-center group and its budget line are, in practice, two halves of
// the same admin decision — a group only exists to hold a Soll (§4.2/§5 of
// the implementation doc: "This group is where budget allocation takes
// place"). This combined dialog is why the standalone Budgets tab was
// folded into Gruppen: creating/editing a group now also sets its
// allocated_amount/warning_threshold_pct in the same step, via two
// sequential backend calls (admin.groups.upsert, then admin.budgets.upsert)
// rather than a separate screen. Not built on the generic AdminFormDialog
// because that dialog only knows how to call one endpoint per submit.
function GroupFormDialog({
  mode,
  projectId,
  group,
  budgetLine,
  trigger,
}: {
  mode: "create" | "edit";
  projectId: string;
  group?: AdminGroup;
  budgetLine?: AdminBudgetLine;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState(group?.name ?? "");
  const [allocated, setAllocated] = useState<number | "">(budgetLine?.allocated ?? "");
  const [warningPct, setWarningPct] = useState<number | "">(budgetLine?.warningThresholdPct ?? 80);

  const missingRequired = !name.trim() || allocated === "" || warningPct === "";

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      let groupId = group?.id;
      if (mode === "create") {
        const result = await callBackend("admin.groups.upsert", { project_id: projectId, name });
        groupId = (result.data as { data: { id: string } }).data.id;
      } else if (groupId) {
        await callBackend("admin.groups.upsert", { id: groupId, name });
      }
      if (!groupId) throw new Error("Gruppe konnte nicht angelegt werden.");

      if (budgetLine) {
        await callBackend("admin.budgets.upsert", {
          id: budgetLine.id,
          allocated_amount: allocated,
          warning_threshold_pct: warningPct,
        });
      } else {
        await callBackend("admin.budgets.upsert", {
          project_id: projectId,
          group_id: groupId,
          allocated_amount: allocated,
          warning_threshold_pct: warningPct,
        });
      }

      toast.success(mode === "create" ? "Gruppe angelegt" : "Änderungen gespeichert");
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error("Speichern fehlgeschlagen", {
        description:
          error instanceof BackendError ? error.message : "Bitte versuchen Sie es erneut.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Neue Gruppe anlegen" : "Gruppe bearbeiten"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="group-name" className="text-xs">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="group-name"
              className="mt-1.5"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="group-allocated" className="text-xs">
              Zugewiesenes Budget (EUR) <span className="text-destructive">*</span>
            </Label>
            <Input
              id="group-allocated"
              type="number"
              step="0.01"
              className="mt-1.5"
              value={allocated}
              onChange={(e) => setAllocated(e.target.value === "" ? "" : Number(e.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="group-warning" className="text-xs">
              Warnschwelle (%) <span className="text-destructive">*</span>
            </Label>
            <Input
              id="group-warning"
              type="number"
              className="mt-1.5"
              value={warningPct}
              onChange={(e) => setWarningPct(e.target.value === "" ? "" : Number(e.target.value))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleSubmit} disabled={missingRequired || submitting}>
            {mode === "create" ? "Anlegen" : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Every group now gets its budget line created alongside it (see
// GroupFormDialog above), and there's no independent UI to delete a budget
// line anymore — so the plain generic DeleteButton would always hit the
// backend's FK-conflict guard here (budget_lines.group_id still points at
// the group). This deletes the budget line first, then the group, mirroring
// creation's order in reverse. If the budget line itself is blocked (e.g.
// an expense already booked against it via budget_line_id), that Conflict
// error surfaces as-is — correctly refusing to delete a group with real
// financial history, not just an empty administrative shell.
function GroupDeleteButton({
  group,
  budgetLine,
  className,
}: {
  group: AdminGroup;
  budgetLine?: AdminBudgetLine;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      if (budgetLine) {
        await callBackend("admin.budgets.delete", { id: budgetLine.id });
      }
      await callBackend("admin.groups.delete", { id: group.id });
      toast.success("Gelöscht");
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.error("Löschen fehlgeschlagen", {
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
        <Button
          size="sm"
          variant="ghost"
          className={cn("text-destructive hover:text-destructive", className)}
        >
          Löschen
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gruppe löschen</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {group.name} und die zugehörige Budget-Zeile werden endgültig gelöscht. Dies ist nur
          möglich, wenn der Gruppe keine Kostenstellen mehr zugeordnet sind und noch keine Belege
          auf ihr Budget gebucht wurden.
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Abbrechen
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={submitting}>
            Löschen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
          <tr key={p.id} className="border-t border-line">
            <td className="px-6 py-3">{p.name}</td>
            <td className="px-6 py-3 text-muted-foreground">{p.contactEmail}</td>
            <td className="px-6 py-3">
              <span className={cn("text-xs", p.active ? "text-success" : "text-muted-foreground")}>
                {p.active ? "Aktiv" : "Inaktiv"}
              </span>
            </td>
            <td className="px-6 py-3 text-right">
              <RowActions
                destructive={
                  <DeleteButton
                    endpoint="admin.partners.delete"
                    id={p.id}
                    confirmTitle="Partner löschen"
                    confirmDescription={`${p.name} wird endgültig gelöscht. Dies ist nur möglich, wenn keine Vorschüsse/Belege mehr auf diesen Partner verweisen.`}
                  />
                }
              >
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
              </RowActions>
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
  warning_threshold_pct: "Standard-Warnschwelle Budgetauslastung (%)",
  advance_requires_ceo_approval: "Vorschuss benötigt CEO-Freigabe",
  notify_slack_channel: "Benachrichtigungs-Kanal (RocketChat)",
  vat_default_rate: "Standard-USt-Satz (%)",
};

// Superseded 2026-09-05 (documentation/approval_routing.md) by a per-user
// Freigabegrenze in the Nutzer tab. Not read anywhere in application logic
// anymore, but deliberately left in the `settings` table itself (not
// deleted) as a historical record — this list is what keeps it out of the
// UI without touching the row. Add a key here if another setting is ever
// superseded the same way.
const SUPERSEDED_SETTING_KEYS = new Set(["ceo_approval_threshold_eur"]);

function SettingsTab({ settings }: { settings: AdminSetting[] }) {
  return (
    <div className="space-y-3">
      {settings.map((s) => (
        <div
          key={s.key}
          className="bg-card ring-1 ring-line card-shape p-5 flex items-center justify-between gap-6"
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
            <tr key={a.id} className="border-t border-line">
              <td className="px-6 py-3 text-xs text-muted-foreground font-mono whitespace-nowrap">
                {fmtDateTime(a.at)}
              </td>
              <td className="px-6 py-3">{a.actorName ?? "—"}</td>
              <td className="px-6 py-3 text-xs font-mono">{a.table}</td>
              <td className="px-6 py-3 text-xs font-mono text-muted-foreground">{a.recordId}</td>
              <td className="px-6 py-3">
                <span
                  className={cn(
                    "text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded",
                    a.action === "insert" && "bg-success/10 text-success",
                    a.action === "update" && "bg-accent text-ember",
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
