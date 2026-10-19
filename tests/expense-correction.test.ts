import { describe, expect, it } from "vitest";
import { correctionPreview } from "@/lib/expense-correction";

// The correction form's preview (d4u_backend migration 0038). The database
// moves Ist by exactly new − old (scripts/test-expense-correction.sh); this
// only checks that the form tells Accounting the same thing beforehand.

const LINE = { allocated: 1100, consumed: 1000, obligo: 0 };

describe("correctionPreview", () => {
  it("shows an increase as a positive change to Ist", () => {
    expect(correctionPreview(LINE, 900, 1050).istChange).toBe(150);
  });

  it("shows a decrease as a negative change, without float noise", () => {
    expect(correctionPreview(LINE, 900.1, 500.2).istChange).toBe(-399.9);
  });

  it("warns when an increase takes the line over its Soll, counting Obligo", () => {
    expect(correctionPreview(LINE, 900, 1000).exceedsBudget).toBe(false);
    expect(correctionPreview(LINE, 900, 1000.01).exceedsBudget).toBe(true);
    expect(correctionPreview({ ...LINE, obligo: 50 }, 900, 1000).exceedsBudget).toBe(true);
  });

  it("never warns on a decrease, even on a line that's already over", () => {
    expect(correctionPreview({ ...LINE, consumed: 2000 }, 900, 800).exceedsBudget).toBe(false);
  });

  it("doesn't warn without a budget line to compare against", () => {
    expect(correctionPreview(null, 900, 5000).exceedsBudget).toBe(false);
  });
});
