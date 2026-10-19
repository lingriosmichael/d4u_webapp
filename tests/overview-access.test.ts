import { describe, expect, it } from "vitest";
import type { Role } from "@/lib/mock-data";
import { canSeeOrganisationOverviews } from "@/lib/overview-access";

// Auswertung's Belege-Übersicht (with its Excel export) and the
// Vorschuss-Übersicht are Accounting and CEO only (confirmed 5 Sep 2026,
// CONTRIBUTING "Vorschuss-Übersicht"). RLS lets Admin read the same rows, so
// this app-level gate is the only thing keeping them from Admin, Finance
// Manager and Project Manager.

describe("canSeeOrganisationOverviews", () => {
  it.each<Role>(["accounting", "ceo"])("lets %s see the overviews", (role) => {
    expect(canSeeOrganisationOverviews(role)).toBe(true);
  });

  it.each<Role>(["admin", "finance_manager", "project_manager"])(
    "keeps %s out, although RLS would let some of them read the rows",
    (role) => {
      expect(canSeeOrganisationOverviews(role)).toBe(false);
    },
  );

  it("fails closed for a role value it doesn't know", () => {
    expect(canSeeOrganisationOverviews("Accounting" as Role)).toBe(false);
    expect(canSeeOrganisationOverviews("" as Role)).toBe(false);
  });
});
