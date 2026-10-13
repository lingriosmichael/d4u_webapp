"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Shuffle } from "lucide-react";
import { toast } from "sonner";
import { fmtDateTime } from "@/lib/mock-data";
import { callBackend, backendErrorMessage } from "@/lib/api";
import type { ExpenseDetail } from "@/lib/supabase/queries/expense-detail";
import type { UploadProject } from "@/lib/supabase/queries/upload-options";
import type { ReassignmentProposal } from "@/lib/supabase/queries/reassignment-proposals";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Umwidmung (reassignment), two steps (d4u_backend migration 0028):
// 1. An FM/PM/CEO proposes a destination — project, cost-center group, cost
//    center. Nothing moves yet.
// 2. Accounting approves exactly that proposal, or rejects it with a reason.
//    Accounting cannot change the destination; a wrong one is rejected and
//    proposed again.
// Which card shows is decided by the backend (permittedActions + the open
// proposal), never by a client-side role check.

interface Destination {
  projectId: string;
  groupId: string;
  costCenterId: string;
}

const EMPTY_DESTINATION: Destination = { projectId: "", groupId: "", costCenterId: "" };

/** Human-readable names for a proposal's destination, resolved from the
 * same project/group/cost-center options the picker uses. Falls back to a
 * dash for anything no longer in those options (e.g. a project archived
 * since the proposal was made) — the backend re-validates on approval. */
function describeDestination(
  projects: UploadProject[],
  destination: ReassignmentProposal["destination"],
) {
  const project = projects.find((p) => p.id === destination.projectId);
  const group = project?.groups.find((g) => g.budgetLineId === destination.budgetLineId);
  const costCenter = group?.costCenters.find((c) => c.id === destination.costCenterId);
  return {
    project: project ? `${project.code} — ${project.name}` : "—",
    group: group?.name ?? "—",
    costCenter: costCenter ? `${costCenter.code} — ${costCenter.name}` : "—",
  };
}

function DestinationSummary({
  label,
  project,
  group,
  costCenter,
}: {
  label: string;
  project: string;
  group: string;
  costCenter: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm text-foreground mt-1 leading-snug">{project}</div>
      <div className="text-xs text-muted-foreground mt-0.5">
        {group} · {costCenter}
      </div>
    </div>
  );
}

function DestinationFields({
  projects,
  value,
  onChange,
}: {
  projects: UploadProject[];
  value: Destination;
  onChange: (next: Destination) => void;
}) {
  const project = projects.find((p) => p.id === value.projectId);
  const group = project?.groups.find((g) => g.id === value.groupId);

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs">Neues Projekt</Label>
        <Select
          value={value.projectId}
          onValueChange={(projectId) => onChange({ ...EMPTY_DESTINATION, projectId })}
        >
          <SelectTrigger className="mt-1.5">
            <SelectValue placeholder="Projekt auswählen" />
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
      <div>
        <Label className="text-xs">Neue Kostenstellen-Gruppe</Label>
        <Select
          value={value.groupId}
          onValueChange={(groupId) => onChange({ ...value, groupId, costCenterId: "" })}
          disabled={!value.projectId}
        >
          <SelectTrigger className="mt-1.5">
            <SelectValue
              placeholder={value.projectId ? "Gruppe auswählen" : "Erst Projekt wählen"}
            />
          </SelectTrigger>
          <SelectContent>
            {(project?.groups ?? []).map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Neue Kostenstelle</Label>
        <Select
          value={value.costCenterId}
          onValueChange={(costCenterId) => onChange({ ...value, costCenterId })}
          disabled={!value.groupId}
        >
          <SelectTrigger className="mt-1.5">
            <SelectValue
              placeholder={value.groupId ? "Kostenstelle auswählen" : "Erst Gruppe wählen"}
            />
          </SelectTrigger>
          <SelectContent>
            {(group?.costCenters ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.code} — {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// --- Step 1: propose (FM / PM / CEO) ----------------------------------------

export function UmwidmungProposeCard({
  expense,
  projects,
}: {
  expense: ExpenseDetail;
  projects: UploadProject[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [destination, setDestination] = useState<Destination>(EMPTY_DESTINATION);
  const [submitting, setSubmitting] = useState(false);

  const budgetLineId = projects
    .find((p) => p.id === destination.projectId)
    ?.groups.find((g) => g.id === destination.groupId)?.budgetLineId;
  const isComplete = Boolean(budgetLineId && destination.costCenterId);
  // The backend refuses this too; saying so here saves a round trip.
  const isCurrentAssignment =
    destination.groupId === expense.groupId && destination.costCenterId === expense.costCenterId;

  const handleSubmit = async () => {
    if (!isComplete || isCurrentAssignment) return;
    setSubmitting(true);
    try {
      await callBackend("expenses.reassign", {
        expenseId: expense.id,
        newProjectId: destination.projectId,
        newBudgetLineId: budgetLineId,
        newCostCenterId: destination.costCenterId,
      });
      toast.success("Umwidmung vorgeschlagen", {
        description: "Die Buchhaltung sieht den Vorschlag in ihren offenen Aufgaben.",
      });
      setOpen(false);
      setDestination(EMPTY_DESTINATION);
      router.refresh();
    } catch (error) {
      toast.error("Konnte nicht vorgeschlagen werden", { description: backendErrorMessage(error) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="bg-card ring-1 ring-line card-shape p-6">
      <h2 className="font-semibold text-sm mb-1">Umwidmung vorschlagen</h2>
      <p className="text-xs text-muted-foreground mb-4 max-w-lg">
        Schlagen Sie vor, diesen Beleg einem anderen Projekt, einer anderen Kostenstellen-Gruppe
        oder einer anderen Kostenstelle zuzuordnen. Erst wenn die Buchhaltung genau diesen Vorschlag
        genehmigt, ändert sich die Zuordnung.
      </p>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Shuffle className="size-4" /> Umwidmung vorschlagen
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Umwidmung vorschlagen</DialogTitle>
            <DialogDescription>
              Wählen Sie die neue Zuordnung. Die Buchhaltung kann sie genehmigen oder ablehnen, aber
              nicht verändern.
            </DialogDescription>
          </DialogHeader>
          <DestinationFields projects={projects} value={destination} onChange={setDestination} />
          {isComplete && isCurrentAssignment && (
            <p className="text-xs text-destructive">
              Das ist die aktuelle Zuordnung dieses Belegs. Bitte wählen Sie ein anderes Ziel.
            </p>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!isComplete || isCurrentAssignment || submitting}
            >
              Vorschlag senden
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

// --- Step 2: decide (Accounting) --------------------------------------------

export function UmwidmungDecisionCard({
  expense,
  proposal,
  proposerName,
  projects,
  canApprove,
  canReject,
}: {
  expense: ExpenseDetail;
  proposal: ReassignmentProposal;
  proposerName: string | null;
  projects: UploadProject[];
  canApprove: boolean;
  canReject: boolean;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const target = describeDestination(projects, proposal.destination);

  const decide = async (decision: "approve" | "reject") => {
    setSubmitting(true);
    try {
      if (decision === "approve") {
        await callBackend("expenses.reassignApprove", {
          expenseId: expense.id,
          proposalId: proposal.proposalId,
        });
        toast.success("Umwidmung genehmigt", { description: "Der Beleg wurde neu zugeordnet." });
      } else {
        await callBackend("expenses.reassignReject", {
          expenseId: expense.id,
          proposalId: proposal.proposalId,
          note: reason,
        });
        toast.success("Umwidmung abgelehnt");
      }
      setConfirmOpen(false);
      setRejectOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(
        decision === "approve" ? "Umwidmung fehlgeschlagen" : "Konnte nicht abgelehnt werden",
        { description: backendErrorMessage(error) },
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="bg-card ring-1 ring-clay/30 card-shape p-6">
      <h2 className="font-semibold text-sm mb-1">Umwidmung genehmigen</h2>
      <p className="text-xs text-muted-foreground mb-4">
        Vorgeschlagen von {proposerName ?? "—"} am {fmtDateTime(proposal.proposedAt)}
      </p>

      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-4 mb-5 p-4 bg-secondary/40 card-shape">
        <DestinationSummary
          label="Aktuell"
          project={`${expense.projectCode ?? ""} — ${expense.projectName ?? "—"}`}
          group={expense.groupName ?? "—"}
          costCenter={
            expense.costCenterCode ? `${expense.costCenterCode} — ${expense.costCenterName}` : "—"
          }
        />
        <ArrowRight className="size-4 text-muted-foreground mt-5" />
        <DestinationSummary label="Vorgeschlagen" {...target} />
      </div>

      <div className="flex flex-wrap gap-2">
        {canApprove && (
          <Button onClick={() => setConfirmOpen(true)} disabled={submitting}>
            Genehmigen
          </Button>
        )}
        {canReject && (
          <Button variant="outline" onClick={() => setRejectOpen(true)} disabled={submitting}>
            Ablehnen
          </Button>
        )}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Umwidmung genehmigen</DialogTitle>
            <DialogDescription>
              Der Beleg wird sofort nach {target.project} · {target.group} verschoben. Ein bereits
              reserviertes Budget wandert mit.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={() => decide("approve")} disabled={submitting}>
              Jetzt umwidmen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Umwidmung ablehnen</DialogTitle>
            <DialogDescription>
              Die Zuordnung bleibt unverändert. Bitte begründen Sie die Ablehnung — die Begründung
              erscheint im Verlauf des Belegs.
            </DialogDescription>
          </DialogHeader>
          <Textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectOpen(false)}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={() => decide("reject")}
              disabled={!reason.trim() || submitting}
            >
              Ablehnen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

// --- Everyone else: a proposal is pending -----------------------------------

export function UmwidmungPendingNotice({
  proposal,
  proposerName,
  projects,
}: {
  proposal: ReassignmentProposal;
  proposerName: string | null;
  projects: UploadProject[];
}) {
  const target = describeDestination(projects, proposal.destination);
  return (
    <section className="bg-card ring-1 ring-line card-shape p-6">
      <h2 className="font-semibold text-sm mb-1">Umwidmung vorgeschlagen</h2>
      <p className="text-xs text-muted-foreground mb-4">
        Von {proposerName ?? "—"} am {fmtDateTime(proposal.proposedAt)} · wartet auf die
        Entscheidung der Buchhaltung
      </p>
      <DestinationSummary label="Vorgeschlagenes Ziel" {...target} />
    </section>
  );
}
