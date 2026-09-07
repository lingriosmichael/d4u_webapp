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
  statusLabel,
  roleLabels,
  OPEN_EXPENSE_STATUSES,
  ALL_EXPENSE_STATUSES,
  type ExpenseStatus,
} from "@/lib/mock-data";
import type { ResponsibleParty } from "@/lib/approval-stage-role";

// URL-searchParams-driven, same mechanism as the project drilldown's
// `?project=` link — filtering re-runs the server-side query on navigation,
// there's no client-side re-filtering of already-fetched rows.

const RESPONSIBLE_LABELS: Record<ResponsibleParty, string> = {
  ceo: roleLabels.ceo,
  accounting: roleLabels.accounting,
  submitter: "Einreicher:in",
};

export function ExpenseFilterBar({
  costCenters,
  projects,
}: {
  costCenters: Array<{ id: string; code: string; name: string }>;
  projects: Array<{ id: string; code: string; name: string }>;
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

  const hasFilters = ["status", "responsible", "costCenter", "expenseProject", "from", "to"].some(
    (k) => searchParams.get(k),
  );

  return (
    <div className="flex flex-wrap items-end gap-3 mb-4">
      <Field label="Status">
        <Select
          value={searchParams.get("status") ?? "open"}
          onValueChange={(v) => setParam("status", v === "open" ? undefined : v)}
        >
          <SelectTrigger className="w-44">
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

      <Field label="Zuständig">
        <Select
          value={searchParams.get("responsible") ?? "all"}
          onValueChange={(v) => setParam("responsible", v === "all" ? undefined : v)}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle</SelectItem>
            {(Object.keys(RESPONSIBLE_LABELS) as ResponsibleParty[]).map((party) => (
              <SelectItem key={party} value={party}>
                {RESPONSIBLE_LABELS[party]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Projekt">
        <Select
          value={searchParams.get("expenseProject") ?? "all"}
          onValueChange={(v) => setParam("expenseProject", v === "all" ? undefined : v)}
        >
          <SelectTrigger className="w-52">
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
          value={searchParams.get("costCenter") ?? "all"}
          onValueChange={(v) => setParam("costCenter", v === "all" ? undefined : v)}
        >
          <SelectTrigger className="w-52">
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
          className="w-36"
          defaultValue={searchParams.get("from") ?? ""}
          onChange={(e) => setParam("from", e.target.value || undefined)}
        />
      </Field>

      <Field label="Bis">
        <Input
          type="date"
          className="w-36"
          defaultValue={searchParams.get("to") ?? ""}
          onChange={(e) => setParam("to", e.target.value || undefined)}
        />
      </Field>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={() => router.push(pathname)}>
          Filter zurücksetzen
        </Button>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}
