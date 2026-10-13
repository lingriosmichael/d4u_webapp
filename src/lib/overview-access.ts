import type { Role } from "@/lib/mock-data";

// Who sees Auswertung's organisation-wide overviews — the Belege-Übersicht
// (with its Excel export) and the Vorschuss-Übersicht. Confirmed decisions
// (5 Sep 2026): Accounting and CEO only. RLS lets Admin read the same rows,
// so this is an app-level gate, checked by the page that renders the
// overviews AND by the export route that serves the file — never only by
// hiding a button.
export function canSeeOrganisationOverviews(role: Role): boolean {
  return role === "accounting" || role === "ceo";
}
