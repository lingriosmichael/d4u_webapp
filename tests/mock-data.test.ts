import { describe, expect, it } from "vitest";
import {
  ALL_EXPENSE_STATUSES,
  OPEN_EXPENSE_STATUSES,
  statusLabel,
  statusTone,
  type ExpenseStatus,
} from "@/lib/mock-data";

// This file's status vocabulary has drifted from the live schema before
// (see mock-data.ts's own ADR comments: "submitted_pending"/"rejected"
// never existed, "finance_approval" was removed) — these tests exist to
// catch the next drift at build time rather than in a screen that quietly
// renders the wrong badge.

describe("statusLabel", () => {
  it("returns a distinct, non-empty German label for every status", () => {
    const labels = ALL_EXPENSE_STATUSES.map(statusLabel);
    expect(labels.every((l) => l.length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("labels the split-advance statuses correctly (migration 0017)", () => {
    expect(statusLabel("awaiting_receipt")).toBe("Beleg fehlt");
    expect(statusLabel("reconciliation_in_progress")).toBe("Aufteilung läuft");
    expect(statusLabel("reconciliation_submitted")).toBe("Bei Buchhaltung");
  });
});

describe("statusTone", () => {
  it("marks terminal success statuses as success", () => {
    expect(statusTone("paid")).toBe("success");
    expect(statusTone("reconciled")).toBe("success");
  });

  it("marks a rejection as danger, not a softer tone", () => {
    expect(statusTone("needs_changes")).toBe("danger");
  });

  it("marks every status as a valid tone (exhaustiveness against ALL_EXPENSE_STATUSES)", () => {
    const validTones = ["neutral", "warning", "info", "success", "danger"];
    for (const status of ALL_EXPENSE_STATUSES) {
      expect(validTones).toContain(statusTone(status));
    }
  });
});

describe("OPEN_EXPENSE_STATUSES / ALL_EXPENSE_STATUSES", () => {
  it("never includes 'draft' (never persisted, per the status-check ADR note)", () => {
    expect(OPEN_EXPENSE_STATUSES).not.toContain("draft" as ExpenseStatus);
    expect(ALL_EXPENSE_STATUSES).not.toContain("draft" as ExpenseStatus);
  });

  it("keeps 'paid' and 'reconciled' out of the open set", () => {
    expect(OPEN_EXPENSE_STATUSES).not.toContain("paid");
    expect(OPEN_EXPENSE_STATUSES).not.toContain("reconciled");
  });

  it("has no duplicate entries across open + terminal statuses", () => {
    expect(new Set(ALL_EXPENSE_STATUSES).size).toBe(ALL_EXPENSE_STATUSES.length);
  });
});
