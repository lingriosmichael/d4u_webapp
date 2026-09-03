"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { useCurrentUser } from "@/lib/role-context";
import { projects, groupsForProject, getCostCenter, costCenters, fmtEUR } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Upload as UploadIcon } from "lucide-react";
import { toast } from "sonner";

export function StandardExpenseForm() {
  const { user } = useCurrentUser();
  const router = useRouter();

  const availableProjects = useMemo(
    () =>
      user.role === "project_manager" ? projects.filter((p) => p.leadUserId === user.id) : projects,
    [user],
  );

  const [projectId, setProjectId] = useState<string>("");
  const [groupId, setGroupId] = useState<string>("");
  const [costCenterId, setCostCenterId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [vendor, setVendor] = useState<string>("");
  const [invoiceNumber, setInvoiceNumber] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);

  const groups = projectId ? groupsForProject(projectId) : [];
  const group = groups.find((g) => g.id === groupId);
  const groupCostCenters = group
    ? group.costCenterIds.map((id) => getCostCenter(id)).filter(Boolean)
    : [];

  const project = availableProjects.find((p) => p.id === projectId);
  const costCenter = costCenters.find((c) => c.id === costCenterId);

  const amountNum = parseFloat(amount.replace(",", "."));
  const isValid =
    projectId &&
    groupId &&
    costCenterId &&
    !isNaN(amountNum) &&
    amountNum > 0 &&
    description.trim().length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    toast.success("Beleg wurde eingereicht", {
      description: "Der Beleg befindet sich nun in der Finanzprüfung.",
    });
    // In real app, POST to API and get id; here we route to a fixture detail.
    router.push("/expenses/EXP-9021");
  };

  return (
    <PageContainer>
      <Link
        href="/upload"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors"
      >
        <ArrowLeft className="size-3.5" /> Zurück zur Auswahl
      </Link>
      <PageHeader
        eyebrow="Standardbeleg"
        title="Beleg einreichen"
        description="Alle Pflichtfelder sind mit einem Sternchen gekennzeichnet. Sie können den Beleg auch ohne Anhang einreichen und diesen später nachreichen."
      />

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <section className="bg-card ring-1 ring-black/5 rounded-xl p-6 space-y-5">
            <h2 className="font-heading font-semibold text-sm">Zuordnung</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <Label htmlFor="project" className="text-xs">
                  Projekt <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={projectId}
                  onValueChange={(v) => {
                    setProjectId(v);
                    setGroupId("");
                    setCostCenterId("");
                  }}
                >
                  <SelectTrigger id="project" className="mt-1.5">
                    <SelectValue placeholder="Projekt auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProjects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.code} — {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="group" className="text-xs">
                  Kostenstellen-Gruppe <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={groupId}
                  onValueChange={(v) => {
                    setGroupId(v);
                    setCostCenterId("");
                  }}
                  disabled={!projectId}
                >
                  <SelectTrigger id="group" className="mt-1.5">
                    <SelectValue
                      placeholder={projectId ? "Gruppe auswählen" : "Erst Projekt wählen"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {groups.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="cc" className="text-xs">
                Kostenstelle <span className="text-destructive">*</span>
              </Label>
              <Select value={costCenterId} onValueChange={setCostCenterId} disabled={!groupId}>
                <SelectTrigger id="cc" className="mt-1.5">
                  <SelectValue
                    placeholder={groupId ? "Kostenstelle auswählen" : "Erst Gruppe wählen"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {groupCostCenters.map((c) => (
                    <SelectItem key={c!.id} value={c!.id}>
                      {c!.code} — {c!.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </section>

          <section className="bg-card ring-1 ring-black/5 rounded-xl p-6 space-y-5">
            <h2 className="font-heading font-semibold text-sm">Belegdaten</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <Label htmlFor="amount" className="text-xs">
                  Betrag (EUR) <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="amount"
                  type="text"
                  inputMode="decimal"
                  className="mt-1.5 font-mono"
                  placeholder="0,00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="invoice" className="text-xs">
                  Rechnungsnummer
                </Label>
                <Input
                  id="invoice"
                  className="mt-1.5"
                  placeholder="z. B. R-2024-1234"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="vendor" className="text-xs">
                Lieferant / Empfänger
              </Label>
              <Input
                id="vendor"
                className="mt-1.5"
                placeholder="z. B. Deutsche Bahn AG"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="description" className="text-xs">
                Beschreibung <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="description"
                className="mt-1.5"
                rows={3}
                placeholder="Kurz und präzise: Was wurde gekauft, wofür wurde es benötigt?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </section>

          <section className="bg-card ring-1 ring-black/5 rounded-xl p-6">
            <h2 className="font-heading font-semibold text-sm mb-4">Beleg (optional)</h2>
            <label className="flex items-center gap-4 p-5 border border-dashed border-border rounded-lg hover:border-navy-600/40 hover:bg-secondary/40 transition-colors cursor-pointer">
              <div className="size-10 bg-navy-100 rounded-md grid place-items-center text-navy-900 shrink-0">
                <UploadIcon className="size-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">
                  {file ? file.name : "Datei auswählen oder hierher ziehen"}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  PDF, JPG oder PNG. Falls kein Beleg vorliegt, können Sie ihn später nachreichen.
                </div>
              </div>
              <input
                type="file"
                className="sr-only"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </section>
        </div>

        <aside className="lg:col-span-1">
          <div className="bg-card ring-1 ring-black/5 rounded-xl p-6 sticky top-8">
            <h2 className="font-heading font-semibold text-sm mb-4">Zusammenfassung</h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-[10px] font-heading font-semibold uppercase tracking-wider text-muted-foreground">
                  Zuordnung
                </dt>
                <dd className="mt-1 text-foreground">
                  {project?.name ?? <span className="text-muted-foreground italic">—</span>}
                  {group && <> · {group.name}</>}
                  {costCenter && (
                    <>
                      {" "}
                      · {costCenter.code} {costCenter.name}
                    </>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-heading font-semibold uppercase tracking-wider text-muted-foreground">
                  Betrag
                </dt>
                <dd className="mt-1 font-mono font-semibold">
                  {!isNaN(amountNum) && amountNum > 0 ? (
                    fmtEUR(amountNum)
                  ) : (
                    <span className="text-muted-foreground italic font-body font-normal">—</span>
                  )}
                </dd>
              </div>
            </dl>

            <div className="mt-6 pt-6 border-t border-black/5 space-y-3">
              <Button type="submit" className="w-full" disabled={!isValid}>
                Beleg einreichen
              </Button>
              <p className="text-[10px] text-muted-foreground text-center">
                Wird zur Prüfung an die Finanzleitung weitergeleitet.
              </p>
            </div>
          </div>
        </aside>
      </form>
    </PageContainer>
  );
}
