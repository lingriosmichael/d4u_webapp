import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type FakeRow } from "./helpers/fake-supabase";

// Beleg-Upload's dropdowns (src/lib/supabase/queries/upload-options.ts).
// Pinned: only active projects and active partners are offered; a group
// is offered under its own project only when that (project, group) has a
// budget line, carrying that budget line's id (POST /api/expenses takes
// budgetLineId); and each group lists exactly its own member cost centers.
// The Project Manager scoping happens in the page (projectsVisibleTo) and
// in RLS, not here.

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const { createClient } = await import("@/lib/supabase/server");
const { getUploadOptions } = await import("@/lib/supabase/queries/upload-options");

function useTables(tables: Record<string, FakeRow[]>) {
  const fake = createFakeSupabase(tables);
  vi.mocked(createClient).mockResolvedValue(fake.client as never);
  return fake;
}

beforeEach(() => {
  vi.mocked(createClient).mockReset();
});

const tables = (): Record<string, FakeRow[]> => ({
  projects: [
    { id: "p2", code: "ZZZ-9", name: "Zukunft", lead_user_id: null, status: "active" },
    { id: "p1", code: "BIB-24", name: "Bildung", lead_user_id: "u-lead", status: "active" },
    { id: "p-closed", code: "ALT-1", name: "Abgeschlossen", lead_user_id: null, status: "closed" },
    { id: "p-hold", code: "HLD-1", name: "Pausiert", lead_user_id: null, status: "on_hold" },
  ],
  cost_center_groups: [
    { id: "g-travel", project_id: "p1", name: "Reisen" },
    { id: "g-catering", project_id: "p1", name: "Verpflegung" },
    { id: "g-unbudgeted", project_id: "p1", name: "Ohne Budget" },
    { id: "g-p2", project_id: "p2", name: "Honorare" },
  ],
  budget_lines: [
    { id: "bl-catering", project_id: "p1", group_id: "g-catering" },
    { id: "bl-travel", project_id: "p1", group_id: "g-travel" },
    { id: "bl-p2", project_id: "p2", group_id: "g-p2" },
    // A budget line pairing a group with a project it doesn't belong to
    // must not make that group selectable elsewhere.
    { id: "bl-mismatch", project_id: "p2", group_id: "g-catering" },
  ],
  cost_center_group_members: [
    { group_id: "g-catering", cost_center_id: "cc-3200" },
    { group_id: "g-catering", cost_center_id: "cc-3210" },
    { group_id: "g-travel", cost_center_id: "cc-4100" },
    { group_id: "g-travel", cost_center_id: "cc-hidden" },
  ],
  cost_centers: [
    { id: "cc-3200", code: "3200", name: "Verpflegung" },
    { id: "cc-3210", code: "3210", name: "Getränke" },
    { id: "cc-4100", code: "4100", name: "Reisekosten" },
  ],
  partners: [
    { id: "partner-b", name: "Verein B", active: true },
    { id: "partner-a", name: "Verein A", active: true },
    { id: "partner-old", name: "Alt e.V.", active: false },
  ],
});

describe("getUploadOptions", () => {
  it("offers only active projects, by code", async () => {
    useTables(tables());
    const { projects } = await getUploadOptions();
    expect(projects.map((p) => [p.code, p.leadUserId])).toEqual([
      ["BIB-24", "u-lead"],
      ["ZZZ-9", null],
    ]);
  });

  it("offers a group only with a budget line, carrying that budget line's id", async () => {
    useTables(tables());
    const { projects } = await getUploadOptions();
    const bildung = projects.find((p) => p.id === "p1")!;
    expect(bildung.groups.map((g) => [g.name, g.budgetLineId])).toEqual([
      ["Reisen", "bl-travel"],
      ["Verpflegung", "bl-catering"],
    ]);
  });

  it("never offers a group under another project, even with a budget line pairing them", async () => {
    useTables(tables());
    const { projects } = await getUploadOptions();
    const zukunft = projects.find((p) => p.id === "p2")!;
    expect(zukunft.groups.map((g) => [g.id, g.budgetLineId])).toEqual([["g-p2", "bl-p2"]]);
  });

  it("lists each group's own cost centers, skipping ones the reader can't see", async () => {
    useTables(tables());
    const { projects } = await getUploadOptions();
    const groups = projects.find((p) => p.id === "p1")!.groups;
    expect(groups.find((g) => g.id === "g-catering")?.costCenters.map((c) => c.code)).toEqual([
      "3200",
      "3210",
    ]);
    expect(groups.find((g) => g.id === "g-travel")?.costCenters.map((c) => c.code)).toEqual([
      "4100",
    ]);
    expect(projects.find((p) => p.id === "p2")!.groups[0].costCenters).toEqual([]);
  });

  it("offers only active partners, by name", async () => {
    useTables(tables());
    expect((await getUploadOptions()).partners.map((p) => p.name)).toEqual([
      "Verein A",
      "Verein B",
    ]);
  });

  it("returns empty lists, without member lookups, when there is nothing to offer", async () => {
    const fake = useTables({});
    expect(await getUploadOptions()).toEqual({ projects: [], partners: [] });
    expect(fake.queriesOn("cost_center_group_members")).toEqual([]);
    expect(fake.queriesOn("cost_centers")).toEqual([]);
  });
});
