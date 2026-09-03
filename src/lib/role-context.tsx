import { createContext, useContext, useState, type ReactNode } from "react";
import { users, type Role, type User } from "./mock-data";

interface RoleContextValue {
  user: User;
  setUserId: (id: string) => void;
  hasRole: (...r: Role[]) => boolean;
}

const RoleContext = createContext<RoleContextValue | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string>("u_fin");
  const user = users.find((u) => u.id === userId) ?? users[0];

  return (
    <RoleContext.Provider
      value={{
        user,
        setUserId,
        hasRole: (...r) => r.includes(user.role),
      }}
    >
      {children}
    </RoleContext.Provider>
  );
}

export function useCurrentUser() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useCurrentUser must be used within RoleProvider");
  return ctx;
}
