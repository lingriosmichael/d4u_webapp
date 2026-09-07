"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useCurrentUser } from "@/lib/role-context";
import { roleLabels, type Role } from "@/lib/mock-data";
import { createClient } from "@/lib/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  ChevronDown,
  LayoutGrid,
  Upload,
  BarChart3,
  Settings2,
  HandCoins,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutGrid;
  roles?: Role[]; // if omitted, all
  exact?: boolean;
}

const primaryNav: NavItem[] = [
  { to: "/", label: "Übersicht", icon: LayoutGrid, exact: true },
  { to: "/upload", label: "Beleg-Upload", icon: Upload },
  // Not role-gated -- whoever submitted a partner advance handles its
  // reconciliation themselves (test-run/OPEN_DECISIONS.md item #2's
  // replacement design), unlike Auswertung's read-only Vorschuss-Übersicht,
  // which stays Accounting/CEO-only.
  { to: "/advances", label: "Vorschüsse", icon: HandCoins },
  { to: "/visualization", label: "Auswertung", icon: BarChart3 },
];

const adminNav: NavItem[] = [
  { to: "/admin", label: "Verwaltung", icon: Settings2, roles: ["admin"] },
];

export function AppShell({
  children,
  pendingCount,
}: {
  children: ReactNode;
  pendingCount: number;
}) {
  const { user } = useCurrentUser();
  const pathname = usePathname();
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.to : pathname === item.to || pathname.startsWith(item.to + "/");

  const visibleAdmin = adminNav.filter((i) => !i.roles || i.roles.includes(user.role));

  return (
    <div className="flex min-h-screen bg-shell font-body text-foreground">
      <aside className="w-64 shrink-0 bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="p-6">
          <div className="text-xs font-semibold tracking-[0.2em] uppercase text-sidebar-foreground/60">
            D4U Finance
          </div>
          <div className="mt-1 text-sm text-sidebar-foreground/40">Interne Belegverwaltung</div>
        </div>

        <nav className="flex-1 px-3 space-y-0.5">
          {primaryNav.map((item) => {
            const active = isActive(item);
            const Icon = item.icon;
            const showBadge = item.exact && pendingCount > 0;
            return (
              <Link
                key={item.to}
                href={item.to}
                className={cn(
                  "flex items-center gap-3 border-l-2 border-transparent px-[10px] py-2 rounded-md text-sm transition-colors",
                  active
                    ? "border-sand bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60",
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span>{item.label}</span>
                {showBadge && (
                  <span className="ml-auto text-[10px] font-mono bg-sidebar-primary/30 text-sidebar-foreground px-1.5 py-0.5 rounded">
                    {pendingCount}
                  </span>
                )}
              </Link>
            );
          })}

          {visibleAdmin.length > 0 && (
            <>
              <div className="pt-6 pb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">
                Administration
              </div>
              {visibleAdmin.map((item) => {
                const active = isActive(item);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    href={item.to}
                    className={cn(
                      "flex items-center gap-3 border-l-2 border-transparent px-[10px] py-2 rounded-md text-sm transition-colors",
                      active
                        ? "border-sand bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60",
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </>
          )}
        </nav>

        <div className="p-4 border-t border-sidebar-border/40">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-sidebar-accent/60 transition-colors text-left">
                <div className="size-9 rounded-full bg-sidebar-primary/40 grid place-items-center text-xs font-semibold text-sidebar-foreground">
                  {user.initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{user.name}</div>
                  <div className="text-[10px] text-sidebar-foreground/50 truncate">
                    {roleLabels[user.role]}
                  </div>
                </div>
                <ChevronDown className="size-3.5 text-sidebar-foreground/40" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-56">
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                {user.email}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={handleSignOut}>Abmelden</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <main className="flex-1 min-w-0 h-screen overflow-y-auto">{children}</main>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-8 flex items-start justify-between gap-6">
      <div>
        {eyebrow && (
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
            {eyebrow}
          </div>
        )}
        <h1 className="font-heading text-[44px] leading-[1.16] font-normal text-foreground tracking-tight text-balance">
          {title}
        </h1>
        {description && (
          <p className="text-muted-foreground text-sm mt-1 max-w-2xl">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </header>
  );
}

export function PageContainer({ children }: { children: ReactNode }) {
  return <div className="max-w-6xl mx-auto px-8 py-12">{children}</div>;
}

export function StatusPill({
  tone,
  children,
}: {
  tone: "neutral" | "warning" | "info" | "success" | "danger";
  children: ReactNode;
}) {
  const toneClass = {
    neutral: "bg-secondary text-secondary-foreground",
    info: "bg-accent text-ember",
    success: "bg-success/10 text-success",
    warning: "bg-warning/15 text-warning-foreground",
    danger: "bg-destructive/10 text-destructive",
  }[tone];
  return (
    <Badge
      className={cn(
        "rounded-full font-semibold uppercase tracking-wider text-[10px] px-2 py-0.5 border-0",
        toneClass,
      )}
    >
      {children}
    </Badge>
  );
}

/**
 * A "nothing to show here" state — an icon, a short heading, and one line
 * of context, contained in a card. Used instead of a bare paragraph so an
 * empty list still reads as a designed state rather than missing content
 * (see dashboard-view.tsx's original "Alles erledigt" card, now shared
 * from here so other screens don't reinvent it slightly differently).
 */
export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <Card className="bg-card p-7 text-center">
      <div className="mx-auto size-10 rounded-full bg-success/10 grid place-items-center mb-3">
        <CheckCircle2 className="size-5 text-success" />
      </div>
      <h2 className="font-heading font-medium text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground mt-1">{description}</p>
    </Card>
  );
}
