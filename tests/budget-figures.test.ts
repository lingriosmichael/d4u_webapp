import { describe, expect, it } from "vitest";
import { BUDGET_LABELS, computeBudgetFigures } from "@/lib/budget-figures";

// How Übersicht and Auswertung present a budget line's Soll/Ist/Obligo.
// The figures come from budget_lines (written only by the RPCs); this only
// decides Verfügbar, the bar widths and the two warning states. Pinned
// because the first copy of this logic floored a real overspend to €0.00.

describe("computeBudgetFigures", () => {
  it("shows what is left as Soll minus Ist minus Obligo", () => {
    const figures = computeBudgetFigures(10_000, 2_500, 1_500);
    expect(figures.verfuegbar).toBe(6_000);
    expect(figures.istPct).toBe(25);
    expect(figures.obligoPct).toBe(15);
    expect(figures.isOverBudget).toBe(false);
    expect(figures.hasInvalidData).toBe(false);
  });

  it("shows a real overspend as a negative Verfügbar, never floored to zero", () => {
    const figures = computeBudgetFigures(1_000, 900, 300);
    expect(figures.verfuegbar).toBe(-200);
    expect(figures.isOverBudget).toBe(true);
    expect(figures.hasInvalidData).toBe(false);
  });

  it("does not call a budget used to the cent over budget", () => {
    const figures = computeBudgetFigures(1_000, 600, 400);
    expect(figures.verfuegbar).toBe(0);
    expect(figures.isOverBudget).toBe(false);
    expect(figures.istPct + figures.obligoPct).toBe(100);
  });

  // KNOWN BUG: budget-figures.ts:33-35 subtracts floats and compares with
  // 0, so a line used exactly to the cent can come out a few 1e-14 below
  // zero: Übersicht and Auswertung then show "Budget überschritten" (and
  // Verfügbar as "-0,00 €") although nothing was overspent. Comparing in
  // whole cents would fix it.
  it.fails("does not call a budget used exactly to the cent over budget (float noise)", () => {
    const figures = computeBudgetFigures(1_234.56, 1_000.01, 234.55);
    expect(figures.isOverBudget).toBe(false);
    expect(Object.is(figures.verfuegbar, -0) || figures.verfuegbar >= 0).toBe(true);
  });

  it("caps the Ist bar at 100% when Ist alone exceeds Soll, leaving no room for Obligo", () => {
    const figures = computeBudgetFigures(1_000, 1_500, 200);
    expect(figures.istPct).toBe(100);
    expect(figures.obligoPct).toBe(0);
    expect(figures.isOverBudget).toBe(true);
  });

  it("caps the Obligo bar at what Ist leaves of 100%", () => {
    const figures = computeBudgetFigures(1_000, 700, 500);
    expect(figures.istPct).toBe(70);
    expect(figures.obligoPct).toBe(30);
    expect(figures.istPct + figures.obligoPct).toBe(100);
  });

  it("keeps unrounded percentages for the bar widths", () => {
    const figures = computeBudgetFigures(3, 1, 1);
    expect(figures.istPct).toBeCloseTo(33.333, 3);
    expect(figures.obligoPct).toBeCloseTo(33.333, 3);
  });

  it("draws empty bars for a line without Soll, but still flags spending on it", () => {
    expect(computeBudgetFigures(0, 0, 0)).toEqual({
      verfuegbar: 0,
      hasInvalidData: false,
      isOverBudget: false,
      istPct: 0,
      obligoPct: 0,
    });

    const spentWithoutSoll = computeBudgetFigures(0, 50, 25);
    expect(spentWithoutSoll.verfuegbar).toBe(-75);
    expect(spentWithoutSoll.isOverBudget).toBe(true);
    expect(spentWithoutSoll.istPct).toBe(0);
    expect(spentWithoutSoll.obligoPct).toBe(0);
  });

  it.each([
    ["Ist", 1_000, -50, 0],
    ["Obligo", 1_000, 0, -50],
  ])(
    "flags a negative %s as invalid data instead of drawing a confident bar",
    (_label, soll, ist, obligo) => {
      const figures = computeBudgetFigures(soll, ist, obligo);
      expect(figures.hasInvalidData).toBe(true);
      expect(figures.isOverBudget).toBe(false);
      expect(figures.istPct).toBe(0);
      expect(figures.obligoPct).toBe(0);
    },
  );

  it("never reports invalid data and over budget at the same time", () => {
    const figures = computeBudgetFigures(100, -10, 500);
    expect(figures.hasInvalidData).toBe(true);
    expect(figures.isOverBudget).toBe(false);
  });
});

describe("BUDGET_LABELS", () => {
  it("uses the plain labels confirmed for the bars (6 Sep 2026)", () => {
    expect(BUDGET_LABELS).toEqual({
      ist: "Ausgezahlt",
      obligo: "Geplant",
      verfuegbar: "Verfügbar",
    });
  });
});
