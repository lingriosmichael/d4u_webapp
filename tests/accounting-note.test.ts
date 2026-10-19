import { describe, expect, it } from "vitest";
import { ACCOUNTING_NOTE_MAX_LENGTH, isAllowedAccountingNote } from "@/lib/accounting-note";

// Mirrors d4u_backend's parseAccountingNote limit (tests/accounting-note-route.test.ts),
// so the form never sends a note the backend would refuse.

describe("isAllowedAccountingNote", () => {
  it("allows an empty note, which clears it", () => {
    expect(isAllowedAccountingNote("")).toBe(true);
  });

  it("counts the trimmed text, as the backend does", () => {
    expect(isAllowedAccountingNote(`  ${"x".repeat(ACCOUNTING_NOTE_MAX_LENGTH)}  `)).toBe(true);
    expect(isAllowedAccountingNote("x".repeat(ACCOUNTING_NOTE_MAX_LENGTH + 1))).toBe(false);
  });
});
