// Correcting a paid expense (d4u_backend migration 0038, implementation doc
// §2I). The form's preview of what a correction does to the budget line.
// Display only: correct_paid_expense moves Ist itself, in the database; the
// figures here only tell Accounting what to expect before saving.

export interface CorrectionPreview {
  /** How much Ist on the expense's budget line changes: new − old. */
  istChange: number;
  /** True when the correction raises Ist and the line then spends more than
   * its Soll (Ist + Obligo above allocated). Allowed (D4U, §2H), only
   * warned about. A decrease never warns, even on a line already over. */
  exceedsBudget: boolean;
}

export function correctionPreview(
  budgetLine: { allocated: number; consumed: number; obligo: number } | null,
  oldAmount: number,
  newAmount: number,
): CorrectionPreview {
  const istChange = Math.round((newAmount - oldAmount) * 100) / 100;
  const exceedsBudget =
    budgetLine !== null &&
    istChange > 0 &&
    budgetLine.consumed + budgetLine.obligo + istChange > budgetLine.allocated;
  return { istChange, exceedsBudget };
}
