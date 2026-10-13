import { describe, expect, it } from "vitest";
import type { Role } from "@/lib/mock-data";
import { isProjectScopedRole, projectsVisibleTo } from "@/lib/project-scoped-roles";

// Since d4u_backend migration 0032 a finance_manager is scoped like a
// project_manager: Übersicht, Auswertung and both upload forms only offer
// the projects they lead. The database enforces the same through RLS.

const projects = [
  { id: "led", leadUserId: "me" },
  { id: "other", leadUserId: "someone-else" },
  { id: "no-lead", leadUserId: null },
];

const user = (role: Role) => ({ id: "me", role });

describe("projectsVisibleTo", () => {
  it.each<Role>(["project_manager", "finance_manager"])(
    "shows a %s only the projects they lead",
    (role) => {
      expect(projectsVisibleTo(user(role), projects).map((p) => p.id)).toEqual(["led"]);
      expect(isProjectScopedRole(role)).toBe(true);
    },
  );

  it.each<Role>(["accounting", "ceo", "admin"])("shows %s every project", (role) => {
    expect(projectsVisibleTo(user(role), projects).map((p) => p.id)).toEqual([
      "led",
      "other",
      "no-lead",
    ]);
    expect(isProjectScopedRole(role)).toBe(false);
  });
});
