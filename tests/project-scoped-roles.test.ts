import { describe, expect, it } from "vitest";
import type { Role } from "@/lib/mock-data";
import { isProjectScopedRole, projectsVisibleTo } from "@/lib/project-scoped-roles";

// A project_manager is scoped to the projects they lead: Übersicht,
// Auswertung and both upload forms only offer those. A finance_manager is
// not (D4U, 13 Oct 2026; d4u_backend migration 0035 reverses 0032). The
// database enforces the same through RLS.

const projects = [
  { id: "led", leadUserId: "me" },
  { id: "other", leadUserId: "someone-else" },
  { id: "no-lead", leadUserId: null },
];

const user = (role: Role) => ({ id: "me", role });

describe("projectsVisibleTo", () => {
  it("shows a project_manager only the projects they lead", () => {
    expect(projectsVisibleTo(user("project_manager"), projects).map((p) => p.id)).toEqual(["led"]);
    expect(isProjectScopedRole("project_manager")).toBe(true);
  });

  it.each<Role>(["finance_manager", "accounting", "ceo", "admin"])(
    "shows %s every project",
    (role) => {
      expect(projectsVisibleTo(user(role), projects).map((p) => p.id)).toEqual([
        "led",
        "other",
        "no-lead",
      ]);
      expect(isProjectScopedRole(role)).toBe(false);
    },
  );
});
