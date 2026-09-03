// Mock data for D4U Finance Workflow. All amounts are EUR.
// This mimics the shape the real Supabase schema would return.

export type Role = "project_manager" | "finance_manager" | "accounting" | "ceo" | "admin";

export type ExpenseStatus =
  | "submitted_pending" // waiting on finance
  | "finance_approval"
  | "ceo_approval"
  | "accounting_approval"
  | "awaiting_payment"
  | "paid"
  | "needs_changes"
  | "rejected"
  | "submitted_unverified"; // partner advances

export type ExpenseType = "standard" | "partner_advance";

export type ReceiptStatus = "missing" | "attached" | "not_applicable";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  initials: string;
}

export interface Project {
  id: string;
  code: string;
  name: string;
  fundingProgram: string;
  status: "active" | "closed";
  leadUserId: string;
  startDate: string;
  endDate: string;
}

export interface CostCenter {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

export interface CostCenterGroup {
  id: string;
  projectId: string;
  name: string;
  costCenterIds: string[];
}

export interface BudgetLine {
  id: string;
  projectId: string;
  groupId: string;
  allocated: number; // EUR
  warningThresholdPct: number;
}

export interface Partner {
  id: string;
  name: string;
  contactEmail: string;
  active: boolean;
}

export type ApprovalAction =
  | "submitted"
  | "approved"
  | "rejected"
  | "requested_changes"
  | "resubmitted"
  | "reconciled"
  | "undo_approval"
  | "documents_received"
  | "marked_paid"
  | "reassigned"
  | "escalated_ceo";

export interface ApprovalLogEntry {
  id: string;
  actorUserId: string;
  action: ApprovalAction;
  at: string;
  note?: string;
}

export interface ReconciliationLine {
  id: string;
  costCenterId: string;
  description: string;
  gross: number;
  vatRate: 0 | 7 | 19;
  net: number; // auto but editable
  ksk: boolean;
  bookingKey?: string;
  supplier?: string;
}

export type AdvanceStage = "placeholder" | "documents_received" | "reconciled";

export interface PaymentDetails {
  bookingKey: string;
  vatRate: 0 | 7 | 19;
  netAmount: number;
  kskLiable: boolean;
  supplierVatId?: string;
  supplierAddress?: string;
  supplierBankName?: string;
}

export interface Expense {
  id: string;
  type: ExpenseType;
  projectId: string;
  groupId: string;
  costCenterId: string | null; // null for advance until reconciled
  amount: number;
  description: string;
  vendor?: string;
  invoiceNumber?: string;
  receiptStatus: ReceiptStatus;
  documentRef?: string; // storage path / URL of the receipt document
  submittedByUserId: string;
  assignedApproverUserId: string | null;
  status: ExpenseStatus;
  partnerId?: string;
  advanceStage?: AdvanceStage;
  paymentDetails?: PaymentDetails;
  createdAt: string;
  reconciliationLines?: ReconciliationLine[];
  logs: ApprovalLogEntry[];
}

export interface AuditLogEntry {
  id: string;
  at: string;
  actorUserId: string;
  table: string;
  recordId: string;
  action: "insert" | "update" | "delete";
  summary: string;
}

// ---- Seed ------------------------------------------------------------------

export const users: User[] = [
  { id: "u_pm", name: "Thomas Meier", email: "thomas@d4u.example", role: "project_manager", active: true, initials: "TM" },
  { id: "u_fin", name: "Marcus Chen", email: "marcus@d4u.example", role: "finance_manager", active: true, initials: "MC" },
  { id: "u_acc", name: "Sarah Weber", email: "sarah@d4u.example", role: "accounting", active: true, initials: "SW" },
  { id: "u_ceo", name: "Anna Krüger", email: "anna@d4u.example", role: "ceo", active: true, initials: "AK" },
  { id: "u_admin", name: "Hanna Kaufmann", email: "hanna@d4u.example", role: "admin", active: true, initials: "HK" },
];

export const partners: Partner[] = [
  { id: "p_lernhaus", name: "Lernhaus e.V.", contactEmail: "buchhaltung@lernhaus.example", active: true },
  { id: "p_kulturfonds", name: "Kulturfonds Mitte", contactEmail: "verwaltung@kulturfonds.example", active: true },
  { id: "p_sport", name: "Sportfonds Neukölln", contactEmail: "kontakt@sportfonds.example", active: true },
];

export const costCenters: CostCenter[] = [
  { id: "cc_1001", code: "1001", name: "Material", active: true },
  { id: "cc_1002", code: "1002", name: "Honorare", active: true },
  { id: "cc_2001", code: "2001", name: "Coaching", active: true },
  { id: "cc_3100", code: "3100", name: "Reisekosten", active: true },
  { id: "cc_3200", code: "3200", name: "Verpflegung", active: true },
  { id: "cc_4100", code: "4100", name: "Personalkosten", active: true },
  { id: "cc_5000", code: "5000", name: "Miete", active: true },
  { id: "cc_6000", code: "6000", name: "Partnerzuwendung", active: true },
];

export const projects: Project[] = [
  {
    id: "prj_bib",
    code: "BIB-24",
    name: "Bildungsinitiative Berlin",
    fundingProgram: "BMFSFJ 2024",
    status: "active",
    leadUserId: "u_pm",
    startDate: "2024-01-01",
    endDate: "2024-12-31",
  },
  {
    id: "prj_int",
    code: "INT-24",
    name: "Integration Neukölln",
    fundingProgram: "Land Berlin",
    status: "active",
    leadUserId: "u_pm",
    startDate: "2024-03-01",
    endDate: "2025-02-28",
  },
  {
    id: "prj_str",
    code: "STR-24",
    name: "Strukturförderung 2024",
    fundingProgram: "BMI",
    status: "active",
    leadUserId: "u_fin",
    startDate: "2024-01-01",
    endDate: "2024-12-31",
  },
];

export const costCenterGroups: CostCenterGroup[] = [
  { id: "g_bib_kita", projectId: "prj_bib", name: "Kita-Ausbau Süd", costCenterIds: ["cc_1001", "cc_1002"] },
  { id: "g_bib_sprach", projectId: "prj_bib", name: "Sprachförderung", costCenterIds: ["cc_2001", "cc_1002"] },
  { id: "g_bib_travel", projectId: "prj_bib", name: "Reise & Verpflegung", costCenterIds: ["cc_3100", "cc_3200"] },
  { id: "g_int_partner", projectId: "prj_int", name: "Partnerzuwendungen", costCenterIds: ["cc_6000"] },
  { id: "g_int_ops", projectId: "prj_int", name: "Betrieb", costCenterIds: ["cc_5000", "cc_4100"] },
  { id: "g_str_pers", projectId: "prj_str", name: "Personal", costCenterIds: ["cc_4100"] },
  { id: "g_str_travel", projectId: "prj_str", name: "Dienstreisen", costCenterIds: ["cc_3100"] },
];

export const budgetLines: BudgetLine[] = [
  { id: "bl_1", projectId: "prj_bib", groupId: "g_bib_kita", allocated: 22000, warningThresholdPct: 80 },
  { id: "bl_2", projectId: "prj_bib", groupId: "g_bib_sprach", allocated: 18000, warningThresholdPct: 80 },
  { id: "bl_3", projectId: "prj_bib", groupId: "g_bib_travel", allocated: 10000, warningThresholdPct: 75 },
  { id: "bl_4", projectId: "prj_int", groupId: "g_int_partner", allocated: 40000, warningThresholdPct: 80 },
  { id: "bl_5", projectId: "prj_int", groupId: "g_int_ops", allocated: 25000, warningThresholdPct: 80 },
  { id: "bl_6", projectId: "prj_str", groupId: "g_str_pers", allocated: 60000, warningThresholdPct: 85 },
  { id: "bl_7", projectId: "prj_str", groupId: "g_str_travel", allocated: 8000, warningThresholdPct: 80 },
];

export const expenses: Expense[] = [
  {
    id: "EXP-9021",
    type: "standard",
    projectId: "prj_bib",
    groupId: "g_bib_travel",
    costCenterId: "cc_3200",
    amount: 142.5,
    description: "Berlin Workshop Verpflegung",
    vendor: "Café Kreuzberg",
    invoiceNumber: "R-2024-8842",
    receiptStatus: "attached",
    documentRef: "/receipts/EXP-9021-cafe-kreuzberg.pdf",
    submittedByUserId: "u_pm",
    assignedApproverUserId: "u_fin",
    status: "finance_approval",
    createdAt: "2024-10-12T09:12:00Z",
    logs: [
      { id: "l1", actorUserId: "u_pm", action: "submitted", at: "2024-10-12T09:12:00Z", note: "Verpflegung für den Workshop am 10.10." },
    ],
  },
  {
    id: "EXP-9020",
    type: "standard",
    projectId: "prj_str",
    groupId: "g_str_travel",
    costCenterId: "cc_3100",
    amount: 249.0,
    description: "Bahncard-Abonnement 2024",
    vendor: "Deutsche Bahn AG",
    invoiceNumber: "BC-24-887",
    receiptStatus: "attached",
    documentRef: "/receipts/EXP-9020-bahncard.pdf",
    submittedByUserId: "u_pm",
    assignedApproverUserId: "u_fin",
    status: "finance_approval",
    createdAt: "2024-10-10T11:00:00Z",
    logs: [{ id: "l2", actorUserId: "u_pm", action: "submitted", at: "2024-10-10T11:00:00Z" }],
  },
  {
    id: "EXP-9015",
    type: "standard",
    projectId: "prj_bib",
    groupId: "g_bib_kita",
    costCenterId: "cc_1001",
    amount: 890.0,
    description: "Büromiete November",
    vendor: "Immobilien Nord",
    invoiceNumber: "IN-11-2024",
    receiptStatus: "attached",
    documentRef: "/receipts/EXP-9015-miete-11.pdf",
    submittedByUserId: "u_pm",
    assignedApproverUserId: "u_ceo",
    status: "ceo_approval",
    createdAt: "2024-10-05T14:20:00Z",
    logs: [
      { id: "l3a", actorUserId: "u_pm", action: "submitted", at: "2024-10-05T14:20:00Z" },
      { id: "l3b", actorUserId: "u_fin", action: "approved", at: "2024-10-06T10:00:00Z", note: "Sachlich und rechnerisch geprüft." },
      { id: "l3c", actorUserId: "u_fin", action: "escalated_ceo", at: "2024-10-06T10:00:05Z", note: "Betrag über der konfigurierten Freigabegrenze." },
    ],
  },
  {
    id: "EXP-9010",
    type: "standard",
    projectId: "prj_bib",
    groupId: "g_bib_sprach",
    costCenterId: "cc_2001",
    amount: 2400.0,
    description: "Partnerabrechnung Sportfonds",
    vendor: "Sportfonds Neukölln",
    invoiceNumber: "SF-24-33",
    receiptStatus: "missing",
    submittedByUserId: "u_pm",
    assignedApproverUserId: "u_pm",
    status: "needs_changes",
    createdAt: "2024-10-01T09:00:00Z",
    logs: [
      { id: "l4a", actorUserId: "u_pm", action: "submitted", at: "2024-10-01T09:00:00Z" },
      {
        id: "l4b",
        actorUserId: "u_fin",
        action: "requested_changes",
        at: "2024-10-02T15:30:00Z",
        note: "Bitte den korrekten Rechnungsempfänger ergänzen — die Rechnung ist auf D4U auszustellen, nicht auf den Mitarbeiter.",
      },
    ],
  },
  {
    id: "EXP-9008",
    type: "partner_advance",
    projectId: "prj_int",
    groupId: "g_int_partner",
    costCenterId: null,
    amount: 5000.0,
    description: "Vorschuss Lernhaus Q4",
    partnerId: "p_lernhaus",
    receiptStatus: "not_applicable",
    advanceStage: "documents_received",
    submittedByUserId: "u_pm",
    assignedApproverUserId: "u_acc",
    status: "submitted_unverified",
    createdAt: "2024-09-28T10:00:00Z",
    logs: [
      { id: "l5a", actorUserId: "u_pm", action: "submitted", at: "2024-09-28T10:00:00Z", note: "Mittelabruf Q4 gemäß Kooperationsvertrag." },
      { id: "l5b", actorUserId: "u_fin", action: "approved", at: "2024-09-28T13:40:00Z" },
      { id: "l5c", actorUserId: "u_acc", action: "marked_paid", at: "2024-09-30T08:15:00Z", note: "Überweisung ausgeführt." },
      { id: "l5d", actorUserId: "u_acc", action: "documents_received", at: "2024-10-14T09:05:00Z", note: "Belegmappe des Partners eingegangen." },
    ],
  },
  {
    id: "EXP-9007",
    type: "partner_advance",
    projectId: "prj_int",
    groupId: "g_int_partner",
    costCenterId: null,
    amount: 3200.0,
    description: "Vorschuss Kulturfonds Q4",
    partnerId: "p_kulturfonds",
    receiptStatus: "not_applicable",
    advanceStage: "placeholder",
    submittedByUserId: "u_pm",
    assignedApproverUserId: "u_acc",
    status: "submitted_unverified",
    createdAt: "2024-10-02T10:00:00Z",
    logs: [
      { id: "l7a", actorUserId: "u_pm", action: "submitted", at: "2024-10-02T10:00:00Z" },
      { id: "l7b", actorUserId: "u_fin", action: "approved", at: "2024-10-02T16:20:00Z" },
      { id: "l7c", actorUserId: "u_acc", action: "marked_paid", at: "2024-10-04T07:50:00Z" },
    ],
  },
  {
    id: "EXP-9005",
    type: "standard",
    projectId: "prj_str",
    groupId: "g_str_pers",
    costCenterId: "cc_4100",
    amount: 1240.0,
    description: "Honorar Fachvortrag",
    vendor: "Dr. K. Böhm",
    invoiceNumber: "H-24-11",
    receiptStatus: "attached",
    documentRef: "/receipts/EXP-9005-honorar.pdf",
    submittedByUserId: "u_pm",
    assignedApproverUserId: "u_acc",
    status: "awaiting_payment",
    createdAt: "2024-09-20T09:00:00Z",
    logs: [
      { id: "l6a", actorUserId: "u_pm", action: "submitted", at: "2024-09-20T09:00:00Z" },
      { id: "l6b", actorUserId: "u_fin", action: "approved", at: "2024-09-21T10:00:00Z" },
      { id: "l6c", actorUserId: "u_fin", action: "escalated_ceo", at: "2024-09-21T10:00:04Z", note: "Betrag über der konfigurierten Freigabegrenze." },
      { id: "l6d", actorUserId: "u_ceo", action: "approved", at: "2024-09-22T11:00:00Z", note: "Freigabe erteilt." },
    ],
  },
  {
    id: "EXP-8990",
    type: "standard",
    projectId: "prj_bib",
    groupId: "g_bib_kita",
    costCenterId: "cc_1002",
    amount: 640.0,
    description: "Honorar Elternworkshop",
    vendor: "M. Alwan",
    invoiceNumber: "AW-24-04",
    receiptStatus: "attached",
    documentRef: "/receipts/EXP-8990-honorar.pdf",
    submittedByUserId: "u_pm",
    assignedApproverUserId: null,
    status: "paid",
    createdAt: "2024-09-02T08:30:00Z",
    paymentDetails: {
      bookingKey: "8400",
      vatRate: 19,
      netAmount: 537.82,
      kskLiable: true,
      supplierVatId: "DE123456789",
      supplierAddress: "Sonnenallee 12, 12045 Berlin",
      supplierBankName: "GLS Bank",
    },
    logs: [
      { id: "l8a", actorUserId: "u_pm", action: "submitted", at: "2024-09-02T08:30:00Z" },
      { id: "l8b", actorUserId: "u_fin", action: "approved", at: "2024-09-03T09:10:00Z" },
      { id: "l8c", actorUserId: "u_acc", action: "marked_paid", at: "2024-09-05T13:45:00Z", note: "Zahllauf KW 36, KSK-pflichtig gekennzeichnet." },
    ],
  },
];

export const auditLog: AuditLogEntry[] = [
  { id: "a1", at: "2024-10-11T08:00:00Z", actorUserId: "u_admin", table: "projects", recordId: "prj_bib", action: "update", summary: "Projektende von 30.11.2024 auf 31.12.2024 verlängert" },
  { id: "a2", at: "2024-10-10T14:30:00Z", actorUserId: "u_admin", table: "cost_center_groups", recordId: "g_bib_travel", action: "insert", summary: "Neue Gruppe „Reise & Verpflegung“ im Projekt BIB-24 angelegt" },
  { id: "a3", at: "2024-10-09T16:12:00Z", actorUserId: "u_admin", table: "users", recordId: "u_pm", action: "update", summary: "Rolle von Finanzleitung auf Projektleitung geändert" },
  { id: "a4", at: "2024-10-08T09:00:00Z", actorUserId: "u_admin", table: "budget_lines", recordId: "bl_3", action: "update", summary: "Zugewiesenes Budget von 8.000,00 € auf 10.000,00 € erhöht" },
  { id: "a5", at: "2024-10-07T11:20:00Z", actorUserId: "u_admin", table: "cost_center_groups", recordId: "g_int_ops", action: "update", summary: "Kostenstelle 4100 Personalkosten der Gruppe „Betrieb“ zugeordnet" },
  { id: "a6", at: "2024-10-06T15:05:00Z", actorUserId: "u_admin", table: "app_settings", recordId: "ceo_approval_threshold_eur", action: "update", summary: "CEO-Freigabegrenze von 500,00 € auf 1.000,00 € gesetzt" },
  { id: "a7", at: "2024-10-05T11:00:00Z", actorUserId: "u_admin", table: "partners", recordId: "p_lernhaus", action: "insert", summary: "Neuer Partner „Lernhaus e.V.“ angelegt" },
  { id: "a8", at: "2024-10-03T10:12:00Z", actorUserId: "u_admin", table: "users", recordId: "u_acc", action: "update", summary: "Zugang aktiviert (active: false → true)" },
];

/**
 * Systemkonfiguration. In der finalen Version kommen diese Werte aus der
 * Tabelle `app_settings` — im Frontend werden sie nur gelesen, nie berechnet.
 */
export const settings = [
  { key: "ceo_approval_threshold_eur", value: 1000, label: "Freigabegrenze für Eskalation an die Geschäftsführung (EUR)" },
  { key: "warning_threshold_pct", value: 80, label: "Standard-Warnschwelle Budgetauslastung (%)" },
  { key: "advance_requires_ceo_approval", value: false, label: "Vorschuss benötigt CEO-Freigabe" },
  { key: "notify_slack_channel", value: "#finance", label: "Benachrichtigungs-Kanal (RocketChat)" },
  { key: "vat_default_rate", value: 19, label: "Standard-USt-Satz (%)" },
];

function settingValue<T>(key: string, fallback: T): T {
  const s = settings.find((x) => x.key === key);
  return (s?.value as T) ?? fallback;
}

/** Konfigurierte Wertgrenze, ab der die Geschäftsführung mitzeichnen muss. */
export const ceoApprovalThreshold = () => settingValue<number>("ceo_approval_threshold_eur", 1000);

/** Standard-Warnschwelle für die Budgetauslastung (Ist + Obligo / Soll). */
export const defaultWarningThresholdPct = () => settingValue<number>("warning_threshold_pct", 80);

export function requiresCeoApproval(amount: number): boolean {
  return amount > ceoApprovalThreshold();
}

// ---- Selectors -------------------------------------------------------------

export function fmtEUR(n: number): string {
  return n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function getUser(id: string): User | undefined {
  return users.find((u) => u.id === id);
}

export function getProject(id: string) {
  return projects.find((p) => p.id === id);
}

export function getCostCenter(id: string | null | undefined) {
  if (!id) return undefined;
  return costCenters.find((c) => c.id === id);
}

export function getGroup(id: string) {
  return costCenterGroups.find((g) => g.id === id);
}

export function getPartner(id: string | undefined) {
  if (!id) return undefined;
  return partners.find((p) => p.id === id);
}

export function getExpense(id: string) {
  return expenses.find((e) => e.id === id);
}

export function groupsForProject(projectId: string) {
  return costCenterGroups.filter((g) => g.projectId === projectId);
}

export function budgetForGroup(groupId: string) {
  return budgetLines.find((b) => b.groupId === groupId);
}

/** Ist (paid + awaiting_payment) and Obligo (in-approval pipeline) per group. */
export function budgetStatusForGroup(groupId: string): { soll: number; ist: number; obligo: number } {
  const budget = budgetForGroup(groupId);
  const soll = budget?.allocated ?? 0;
  let ist = 0;
  let obligo = 0;
  for (const e of expenses) {
    if (e.groupId !== groupId) continue;
    if (e.status === "paid" || e.status === "awaiting_payment") ist += e.amount;
    else if (
      e.status === "finance_approval" ||
      e.status === "ceo_approval" ||
      e.status === "accounting_approval" ||
      e.status === "submitted_unverified" ||
      e.status === "submitted_pending"
    ) {
      obligo += e.amount;
    }
  }
  return { soll, ist, obligo };
}

export function budgetStatusForProject(projectId: string) {
  const groups = groupsForProject(projectId);
  return groups.reduce(
    (acc, g) => {
      const s = budgetStatusForGroup(g.id);
      acc.soll += s.soll;
      acc.ist += s.ist;
      acc.obligo += s.obligo;
      return acc;
    },
    { soll: 0, ist: 0, obligo: 0 },
  );
}

/** Which expenses "need action" from a given user right now. */
export function needsActionFor(user: User): Expense[] {
  return expenses.filter((e) => {
    if (user.role === "accounting" && e.status === "submitted_unverified") return true;
    if (e.assignedApproverUserId === user.id) {
      // an owner viewing a needs_changes item — that IS their action
      return true;
    }
    return false;
  });
}

export function statusLabel(s: ExpenseStatus): string {
  switch (s) {
    case "submitted_pending": return "Eingereicht";
    case "finance_approval": return "Finanzprüfung";
    case "ceo_approval": return "CEO-Freigabe";
    case "accounting_approval": return "Buchhaltungsprüfung";
    case "awaiting_payment": return "Zahlung ausstehend";
    case "paid": return "Bezahlt";
    case "needs_changes": return "Korrektur nötig";
    case "rejected": return "Abgelehnt";
    case "submitted_unverified": return "Abrechnung offen";
  }
}

export function statusTone(s: ExpenseStatus): "neutral" | "warning" | "info" | "success" | "danger" {
  switch (s) {
    case "paid": return "success";
    case "awaiting_payment": return "info";
    case "needs_changes":
    case "rejected": return "danger";
    case "submitted_unverified": return "warning";
    default: return "neutral";
  }
}

// ---- Display helpers -------------------------------------------------------

export function expenseTypeLabel(t: ExpenseType): string {
  return t === "partner_advance" ? "Partner-Vorschuss" : "Standard";
}

export function receiptStatusLabel(s: ReceiptStatus): string {
  switch (s) {
    case "attached": return "Beleg angehängt";
    case "missing": return "Beleg fehlt";
    case "not_applicable": return "Beleg nicht erforderlich";
  }
}

export function receiptStatusTone(s: ReceiptStatus): "neutral" | "warning" | "info" | "success" | "danger" {
  switch (s) {
    case "attached": return "success";
    case "missing": return "danger";
    case "not_applicable": return "neutral";
  }
}

export function advanceStageLabel(s: AdvanceStage | undefined): string {
  switch (s) {
    case "documents_received": return "Unterlagen eingegangen";
    case "reconciled": return "Abgerechnet";
    default: return "Platzhalter";
  }
}

export function advanceStageTone(s: AdvanceStage | undefined): "neutral" | "warning" | "info" | "success" | "danger" {
  switch (s) {
    case "documents_received": return "info";
    case "reconciled": return "success";
    default: return "warning";
  }
}

export function approvalActionLabel(a: ApprovalAction): string {
  switch (a) {
    case "submitted": return "Eingereicht";
    case "approved": return "Freigegeben";
    case "rejected": return "Abgelehnt";
    case "requested_changes": return "Korrektur angefordert";
    case "resubmitted": return "Erneut eingereicht";
    case "reconciled": return "Abgerechnet";
    case "undo_approval": return "Freigabe zurückgezogen";
    case "documents_received": return "Unterlagen eingegangen";
    case "marked_paid": return "Als bezahlt markiert";
    case "reassigned": return "Umgewidmet";
    case "escalated_ceo": return "An Geschäftsführung eskaliert";
  }
}

/** Offene Partner-Vorschüsse, die noch abgerechnet werden müssen. */
export function openAdvances(): Expense[] {
  return expenses.filter((e) => e.type === "partner_advance" && e.status === "submitted_unverified");
}

export function expensesForGroup(groupId: string): Expense[] {
  return expenses.filter((e) => e.groupId === groupId);
}
