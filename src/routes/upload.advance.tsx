import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageContainer, PageHeader } from "@/components/app-shell";
import { useCurrentUser } from "@/lib/role-context";
import {
  projects,
  groupsForProject,
  getCostCenter,
  costCenters,
  partners,
  fmtEUR,
} from "@/lib/mock-data";
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
import { ArrowLeft, Info } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/upload/advance")({
  head: () => ({ meta: [{ title: "Partner-Vorschuss anlegen — D4U Finance" }] }),
  component: AdvanceForm,
});

function AdvanceForm() {
  const { user } = useCurrentUser();
  const navigate = useNavigate();

  const availableProjects = useMemo(
    () => (user.role === "project_manager" ? projects.filter((p) => p.leadUserId === user.id) : projects),
    [user],
  );

  const [projectId, setProjectId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [costCenterId, setCostCenterId] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  const groups = projectId ? groupsForProject(projectId) : [];
  const group = groups.find((g) => g.id === groupId);
  const groupCostCenters = group ? group.costCenterIds.map((id) => getCostCenter(id)).filter(Boolean) : [];
  const project = availableProjects.find((p) => p.id === projectId);
  const costCenter = costCenters.find((c) => c.id === costCenterId);
  const partner = partners.find((p) => p.id === partnerId);

  const amountNum = parseFloat(amount.replace(",", "."));
  const isValid =
    projectId &&
    groupId &&
    costCenterId &&
    partnerId &&
    !isNaN(amountNum) &&
    amountNum > 0 &&
    description.trim().length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    toast.success("Vorschuss angelegt", {
      description: "Der Vorschuss ist zur Auszahlung freigegeben.",
    });
    navigate({ to: "/expenses/$id", params: { id: "EXP-9008" } });
  };

  return (
    <PageContainer>
      <Link
        to="/upload"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors"
      >
        <ArrowLeft className="size-3.5" /> Zurück zur Auswahl
      </Link>
      <PageHeader
        eyebrow="Partner-Vorschuss"
        title="Vorschuss anlegen"
        description="Vorschüsse an Partner werden ohne Freigabelauf direkt zur Auszahlung markiert. Die Buchhaltung rechnet später anhand der eingereichten Belege ab."
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
                    <SelectValue placeholder={projectId ? "Gruppe auswählen" : "Erst Projekt wählen"} />
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <Label htmlFor="cc" className="text-xs">
                  Kostenstelle <span className="text-destructive">*</span>
                </Label>
                <Select value={costCenterId} onValueChange={setCostCenterId} disabled={!groupId}>
                  <SelectTrigger id="cc" className="mt-1.5">
                    <SelectValue placeholder={groupId ? "Kostenstelle auswählen" : "Erst Gruppe wählen"} />
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
              <div>
                <Label htmlFor="partner" className="text-xs">
                  Partner <span className="text-destructive">*</span>
                </Label>
                <Select value={partnerId} onValueChange={setPartnerId}>
                  <SelectTrigger id="partner" className="mt-1.5">
                    <SelectValue placeholder="Partner auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {partners
                      .filter((p) => p.active)
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <section className="bg-card ring-1 ring-black/5 rounded-xl p-6 space-y-5">
            <h2 className="font-heading font-semibold text-sm">Vorschuss</h2>
            <div>
              <Label htmlFor="amount" className="text-xs">
                Betrag (EUR) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="amount"
                type="text"
                inputMode="decimal"
                className="mt-1.5 font-mono max-w-xs"
                placeholder="0,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="description" className="text-xs">
                Verwendungszweck <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="description"
                className="mt-1.5"
                rows={3}
                placeholder="Wofür wird der Vorschuss benötigt?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="flex gap-3 p-4 bg-navy-100/60 rounded-lg text-xs text-navy-900">
              <Info className="size-4 shrink-0 mt-0.5" />
              <p>
                Belege werden bei der späteren Abrechnung durch die Buchhaltung eingesammelt — für den
                Vorschuss selbst ist kein Beleg-Upload nötig.
              </p>
            </div>
          </section>
        </div>

        <aside className="lg:col-span-1">
          <div className="bg-card ring-1 ring-black/5 rounded-xl p-6 sticky top-8">
            <h2 className="font-heading font-semibold text-sm mb-4">Zusammenfassung</h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-[10px] font-heading font-semibold uppercase tracking-wider text-muted-foreground">
                  Projekt
                </dt>
                <dd className="mt-1">{project?.name ?? <span className="text-muted-foreground italic">—</span>}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-heading font-semibold uppercase tracking-wider text-muted-foreground">
                  Partner
                </dt>
                <dd className="mt-1">{partner?.name ?? <span className="text-muted-foreground italic">—</span>}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-heading font-semibold uppercase tracking-wider text-muted-foreground">
                  Kostenstelle
                </dt>
                <dd className="mt-1">
                  {costCenter ? `${costCenter.code} ${costCenter.name}` : <span className="text-muted-foreground italic">—</span>}
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
                Vorschuss anlegen
              </Button>
              <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
                Vorschüsse benötigen keine Freigabe und werden sofort zur Auszahlung markiert.
              </p>
            </div>
          </div>
        </aside>
      </form>
    </PageContainer>
  );
}
