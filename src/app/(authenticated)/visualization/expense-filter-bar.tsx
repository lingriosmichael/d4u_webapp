"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fmtEUR,
  statusLabel,
  OPEN_EXPENSE_STATUSES,
  ALL_EXPENSE_STATUSES,
  type ExpenseStatus,
} from "@/lib/mock-data";
import { RESPONSIBLE_PARTY_LABELS, type ResponsibleParty } from "@/lib/approval-stage-role";
import { Download } from "lucide-react";

// URL-searchParams-driven, same mechanism as the project drilldown's
// `?project=` link — filtering re-runs the server-side query on navigation,
// there's no client-side re-filtering of already-fetched rows. The Excel
// export link carries the same params to /visualization/export, so the file
// always holds exactly the rows on screen.

const FILTER_PARAMS = ["status", "responsible", "costCenter", "expenseProject", "from", "to"];

export function ExpenseFilterBar({
  costCenters,
  projects,
  rowCount,
  total,
  hasSplitAdvances,
}: {
  costCenters: Array<{ id: string; code: string; name: string }>;
  projects: Array<{ id: string; code: string; name: string }>;
  rowCount: number;
  /** Sum of the rows that count once (see expense-overview-structure.ts). */
  total: number;
  hasSplitAdvances: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string | undefined) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  const hasFilters = FILTER_PARAMS.some((k) => searchParams.get(k));
  const exportParams = new URLSearchParams();
  for (const key of FILTER_PARAMS) {
    const value = searchParams.get(key);
    if (value) exportParams.set(key, value);
  }
  const exportQuery = exportParams.toString();
  const exportHref = `/visualization/export${exportQuery ? `?${exportQuery}` : ""}`;

  return (
    <div className="space-y-3 mb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground tabular-nums">
          {rowCount === 1 ? "1 Eintrag" : `${rowCount} Einträge`} · Summe{" "}
          <span className="text-foreground font-medium">{fmtEUR(total)}</span>
          {hasSplitAdvances && " · aufgeteilte Vorschüsse zählen über ihre Positionen"}
        </span>
        <div className="flex items-center gap-2">
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={() => router.push(pathname)}>
              Filter zurücksetzen
            </Button>
          )}
          {rowCount > 0 ? (
            <Button asChild variant="outline" size="sm">
              <a href={exportHref}>
                <Download /> Als Excel exportieren
              </a>
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              <Download /> Als Excel exportieren
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Field label="Status">
          <Select
            value={searchParams.get("status") || "open"}
            onValueChange={(v) => setParam("status", v === "open" ? undefined : v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Offen (Standard)</SelectItem>
              <SelectItem value="all">Alle</SelectItem>
              {ALL_EXPENSE_STATUSES.filter((s) => OPEN_EXPENSE_STATUSES.includes(s)).map((s) => (
                <SelectItem key={s} value={s}>
                  {statusLabel(s as ExpenseStatus)}
                </SelectItem>
              ))}
              {ALL_EXPENSE_STATUSES.filter((s) => !OPEN_EXPENSE_STATUSES.includes(s)).map((s) => (
                <SelectItem key={s} value={s}>
                  {statusLabel(s as ExpenseStatus)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Wartet auf">
          <Select
            value={searchParams.get("responsible") || "all"}
            onValueChange={(v) => setParam("responsible", v === "all" ? undefined : v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              {(Object.keys(RESPONSIBLE_PARTY_LABELS) as ResponsibleParty[]).map((party) => (
                <SelectItem key={party} value={party}>
                  {RESPONSIBLE_PARTY_LABELS[party]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Projekt">
          <Select
            value={searchParams.get("expenseProject") || "all"}
            onValueChange={(v) => setParam("expenseProject", v === "all" ? undefined : v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.code} · {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Kostenstelle">
          <Select
            value={searchParams.get("costCenter") || "all"}
            onValueChange={(v) => setParam("costCenter", v === "all" ? undefined : v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              {costCenters.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.code} · {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Von">
          <Input
            type="date"
            className="w-full"
            defaultValue={searchParams.get("from") ?? ""}
            onChange={(e) => setParam("from", e.target.value || undefined)}
          />
        </Field>

        <Field label="Bis">
          <Input
            type="date"
            className="w-full"
            defaultValue={searchParams.get("to") ?? ""}
            onChange={(e) => setParam("to", e.target.value || undefined)}
          />
        </Field>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}
