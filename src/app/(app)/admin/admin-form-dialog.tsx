"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { callBackend, BackendError, type BackendEndpoint } from "@/lib/api";
import { toast } from "sonner";

// One generic create/edit dialog reused across every Verwaltung tab,
// instead of six near-identical bespoke forms — mirrors
// d4u_backend/src/lib/admin-resources.ts's config-driven approach to the
// same duplication problem on the write side. Field keys must be the exact
// snake_case column names admin-resources.ts whitelists for that resource
// — this dialog sends them straight through, no camelCase translation
// layer, since the generic admin/[resource] routes expect that verbatim.

export type AdminField =
  | { key: string; label: string; type: "text" | "email" | "date"; required?: boolean }
  | { key: string; label: string; type: "number"; required?: boolean; step?: string }
  | { key: string; label: string; type: "switch" }
  | {
      key: string;
      label: string;
      type: "select";
      options: Array<{ value: string; label: string }>;
      required?: boolean;
    };

export function AdminFormDialog({
  trigger,
  title,
  endpoint,
  fields,
  initial,
  recordId,
}: {
  trigger: React.ReactNode;
  title: string;
  endpoint: BackendEndpoint;
  fields: AdminField[];
  /** Pre-filled values for editing; omit for create. */
  initial?: Record<string, unknown>;
  /** Existing record id — presence makes this an edit (PATCH), absence a create (POST). */
  recordId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, unknown>>(initial ?? {});
  const [submitting, setSubmitting] = useState(false);

  const setField = (key: string, value: unknown) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const missingRequired = fields.some(
    (f) => "required" in f && f.required && !String(values[f.key] ?? "").trim(),
  );

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await callBackend(endpoint, recordId ? { ...values, id: recordId } : values);
      toast.success(recordId ? "Änderungen gespeichert" : "Eintrag angelegt");
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
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {fields.map((f) => (
            <div key={f.key}>
              <Label htmlFor={f.key} className="text-xs">
                {f.label}{" "}
                {"required" in f && f.required && <span className="text-destructive">*</span>}
              </Label>
              {f.type === "select" ? (
                <Select
                  value={String(values[f.key] ?? "")}
                  onValueChange={(v) => setField(f.key, v)}
                >
                  <SelectTrigger id={f.key} className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {f.options.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : f.type === "switch" ? (
                <div className="mt-1.5">
                  <Switch checked={!!values[f.key]} onCheckedChange={(v) => setField(f.key, v)} />
                </div>
              ) : (
                <Input
                  id={f.key}
                  type={f.type}
                  step={f.type === "number" ? f.step : undefined}
                  className="mt-1.5"
                  value={values[f.key] != null ? String(values[f.key]) : ""}
                  onChange={(e) =>
                    setField(f.key, f.type === "number" ? Number(e.target.value) : e.target.value)
                  }
                />
              )}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleSubmit} disabled={missingRequired || submitting}>
            {recordId ? "Speichern" : "Anlegen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
