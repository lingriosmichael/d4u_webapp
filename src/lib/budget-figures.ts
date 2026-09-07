// Shared Soll/Ist/Obligo/Verfügbar display logic for the Übersicht and
// Auswertung budget bars. Kept in one place so the two pages can't drift —
// same reasoning as the backend's one shared authorization guard: this is
// the second place this exact arithmetic and copy would otherwise be
// hand-duplicated, and the first duplication already produced a display
// bug (Verfügbar silently floored to €0.00 instead of showing a real
// overspend). Values themselves still come only from the backend/database
// (dashboard.ts, visualization.ts) — this module only decides how to
// present them, never recomputes Soll/Ist/Obligo.

export interface BudgetFigures {
  verfuegbar: number;
  /**
   * Ist and Obligo are amounts written only by backend RPCs and should
   * never be negative by definition — a negative value here means the
   * underlying budget-line data is corrupted (see d4u_backend migration
   * 0013's postmortem for a prior real occurrence of this bug class), not
   * that the project has "negative spend." Rendering a normal proportional
   * bar from a corrupted number would look confidently correct and
   * mislead whoever reads it.
   */
  hasInvalidData: boolean;
  /** A real, legitimate state (committed + spent exceeds budget) — distinct from hasInvalidData. */
  isOverBudget: boolean;
  istPct: number;
  obligoPct: number;
}

export function computeBudgetFigures(soll: number, ist: number, obligo: number): BudgetFigures {
  const verfuegbar = soll - ist - obligo;
  const hasInvalidData = ist < 0 || obligo < 0;
  const isOverBudget = !hasInvalidData && verfuegbar < 0;

  const istPct = !hasInvalidData && soll > 0 ? Math.min(100, (ist / soll) * 100) : 0;
  const obligoPct =
    !hasInvalidData && soll > 0 ? Math.min(Math.max(0, 100 - istPct), (obligo / soll) * 100) : 0;

  return { verfuegbar, hasInvalidData, isOverBudget, istPct, obligoPct };
}

// Plain-German labels for the Ist/Obligo/Verfügbar budget figures, used
// consistently everywhere the bar or its metrics are shown so the two
// pages (Übersicht, Auswertung) can't drift onto different wording.
// Confirmed 6 Sep 2026: plain labels directly on the bar/metrics instead
// of a separate legend explaining the Soll/Ist/Obligo business terms —
// "Ist"/"Obligo" are still the vocabulary in exports, Verwaltung, and the
// implementation doc, so a reader moving between screens may still meet
// both; flag this if that inconsistency becomes a problem later.
export const BUDGET_LABELS = {
  ist: "Ausgezahlt",
  obligo: "Geplant",
  verfuegbar: "Verfügbar",
} as const;
