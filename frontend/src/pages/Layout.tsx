import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bell, LogOut, Menu, User, X } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useRealtime } from "../hooks/useRealtime";
import { notifications } from "../lib/notifications";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Sheet, SheetContent } from "./ui/sheet";
import drcipLockup from "../assets/brand/drcip-lockup-horizontal.svg";

const ALL_ROLES = ["CITIZEN", "FIELD_OFFICER", "DISASTER_COORDINATOR", "ADMINISTRATOR"];

const ROLE_LABELS: Record<string, string> = {
  CITIZEN: "Citizen",
  FIELD_OFFICER: "Field Officer",
  DISASTER_COORDINATOR: "Disaster Coordinator",
  ADMINISTRATOR: "Administrator",
};

interface NavItem {
  label: string;
  to: string;
  roles: string[];
  end?: boolean;
  /** Extra path prefixes that should also activate this item. */
  activePrefixes?: string[];
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Citizen",
    items: [
      { label: "Report Incident", to: "/report", roles: ["CITIZEN", "FIELD_OFFICER"] },
      { label: "My Incidents", to: "/incidents", roles: ["CITIZEN"] },
    ],
  },
  {
    title: "Field Operations",
    items: [
      { label: "Field Dashboard", to: "/field", roles: ["FIELD_OFFICER"], end: true },
      { label: "My Team", to: "/field/team", roles: ["FIELD_OFFICER"] },
      { label: "My Assignments", to: "/field/assignments", roles: ["FIELD_OFFICER"] },
      { label: "Field Update", to: "/field/update", roles: ["FIELD_OFFICER"] },
    ],
  },
  {
    title: "Command & Operations",
    items: [
      {
        label: "Command Center",
        to: "/dashboard",
        roles: ["DISASTER_COORDINATOR", "ADMINISTRATOR"],
        // Incident detail + allocation review (/incidents/:id, /incidents/:id/review)
        // are Command surfaces reached from the dashboard.
        activePrefixes: ["/incidents"],
      },
      { label: "Assignments", to: "/assignments", roles: ["DISASTER_COORDINATOR", "ADMINISTRATOR"] },
      { label: "Resources", to: "/resources", roles: ["FIELD_OFFICER", "DISASTER_COORDINATOR", "ADMINISTRATOR"] },
      { label: "Teams", to: "/teams", roles: ["DISASTER_COORDINATOR", "ADMINISTRATOR"] },
      { label: "Shelters", to: "/shelters", roles: ["DISASTER_COORDINATOR", "ADMINISTRATOR"] },
    ],
  },
  {
    title: "Reports & Intelligence",
    items: [
      { label: "Reports", to: "/reports", roles: ["DISASTER_COORDINATOR", "ADMINISTRATOR"] },
      {
        label: "RAG Assistant",
        to: "/rag",
        roles: ["FIELD_OFFICER", "DISASTER_COORDINATOR", "ADMINISTRATOR"],
        // The Administrator RAG surface lives at /admin/rag.
        activePrefixes: ["/admin/rag"],
      },
    ],
  },
  {
    title: "Administration",
    items: [
      { label: "Overview", to: "/admin", roles: ["ADMINISTRATOR"], end: true },
      { label: "Users", to: "/admin/users", roles: ["ADMINISTRATOR"] },
      { label: "Audit Log", to: "/admin/audit", roles: ["DISASTER_COORDINATOR", "ADMINISTRATOR"] },
      { label: "System Health", to: "/admin/health", roles: ["ADMINISTRATOR"] },
    ],
  },
];

function NavItemLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const location = useLocation();
  const prefixActive = item.activePrefixes?.some((prefix) => location.pathname.startsWith(prefix)) ?? false;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "group relative flex items-center rounded-drcip-md px-3 py-2 text-sm transition-colors",
          isActive || prefixActive
            ? "bg-surface font-medium text-ink shadow-drcip-sm"
            : "text-text-secondary hover:bg-surface-cool hover:text-ink",
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            aria-hidden="true"
            className={cn(
              "absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-cobalt-deep transition-opacity",
              isActive || prefixActive ? "opacity-100" : "opacity-0",
            )}
          />
          <span className="truncate">{item.label}</span>
        </>
      )}
    </NavLink>
  );
}

function renderGroups(role: string, onNavigate?: () => void) {
  return NAV_GROUPS.map((group) => {
    const items = group.items.filter((item) => item.roles.includes(role));
    if (items.length === 0) return null;
    return (
      <div key={group.title}>
        <p className="px-3 pb-1 pt-5 font-mono text-[11px] uppercase tracking-wider text-muted">{group.title}</p>
        <ul className="space-y-0.5">
          {items.map((item) => (
            <li key={item.to}>
              <NavItemLink item={item} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
      </div>
    );
  });
}

const ICON_LINK_CLASSES =
  "flex h-11 w-11 items-center justify-center rounded-drcip-md text-text-secondary transition-colors hover:bg-surface-cool hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-electric";

export function Layout() {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useRealtime();

  const { data: unread } = useQuery({
    queryKey: ["notifications"],
    enabled: !!user,
    queryFn: () => notifications.list({ unread_only: "true", limit: 1 }),
    // The badge is WS-driven; if a frame is ever missed the count could go
    // stale indefinitely. REST is authoritative, so reconcile from the API
    // whenever the window regains focus or the network reconnects.
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  const unreadCount = unread?.pagination?.total ?? 0;

  const role = user?.role;
  const roleLabel = role ? (ROLE_LABELS[role] ?? role) : null;

  return (
    <div className="flex min-h-screen flex-col bg-surface-cool">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-drcip-md focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-ink focus:shadow-drcip-md"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-border bg-surface">
        <div className="flex h-16 items-center justify-between gap-3 px-4 md:px-6">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 md:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </Button>
            <Link to="/" aria-label="DRCIP home" className="flex items-center">
              <img src={drcipLockup} alt="" className="h-8 w-auto" />
            </Link>
          </div>

          <div className="flex items-center gap-1 md:gap-2">
            {user && roleLabel && (
              <span className="mr-1 hidden items-center gap-1.5 rounded-full border border-border bg-surface-cool px-2.5 py-1 md:inline-flex font-mono text-[11px] uppercase tracking-wider text-text-secondary">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-cobalt-deep" />
                {roleLabel}
              </span>
            )}
            {user && (
              <Link to="/notifications" aria-label={`Notifications (${unreadCount} unread)`} className={cn("relative", ICON_LINK_CLASSES)}>
                <Bell className="h-5 w-5" aria-hidden="true" />
                {unreadCount > 0 && (
                  <span className="absolute right-1.5 top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-status-error px-1 text-[10px] font-semibold text-white">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </Link>
            )}
            <Link to="/profile" aria-label="Profile" className={ICON_LINK_CLASSES}>
              <User className="h-5 w-5" aria-hidden="true" />
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11"
              onClick={logout}
              aria-label="Log out"
            >
              <LogOut className="h-5 w-5" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 items-stretch">
        <aside className="hidden w-60 shrink-0 border-r border-border bg-surface md:block">
          <nav aria-label="Primary" className="sticky top-16 max-h-[calc(100vh-4rem)] overflow-y-auto px-3 py-4">
            <ul className="space-y-0.5">
              <li>
                <NavItemLink item={{ label: "Home", to: "/", roles: ALL_ROLES, end: true }} />
              </li>
            </ul>
            {user ? renderGroups(user.role) : null}
          </nav>
        </aside>

        <main id="main-content" className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-drcip px-4 py-6 md:px-6 md:py-8 lg:px-8">
            <Outlet />
          </div>
        </main>
      </div>

      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen} label="Navigation">
        <SheetContent className="p-0">
          <div className="flex h-full flex-col">
            <div className="flex h-16 items-center justify-between border-b border-border px-4">
              <img src={drcipLockup} alt="DRCIP" className="h-8 w-auto" />
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11"
                onClick={() => setSidebarOpen(false)}
                aria-label="Close navigation menu"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </Button>
            </div>

            {user && roleLabel && (
              <div className="border-b border-border px-4 py-3">
                <p className="text-sm font-medium text-ink">{user.name}</p>
                <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wider text-muted">{roleLabel}</p>
              </div>
            )}

            <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 pb-4">
              <ul className="space-y-0.5 pt-3">
                <li>
                  <NavItemLink item={{ label: "Home", to: "/", roles: ALL_ROLES, end: true }} onNavigate={() => setSidebarOpen(false)} />
                </li>
              </ul>
              {user ? renderGroups(user.role, () => setSidebarOpen(false)) : null}
            </nav>

            <div className="flex gap-2 border-t border-border p-3">
              <Link
                to="/profile"
                className="flex flex-1 items-center justify-center gap-2 rounded-drcip-md border border-border py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-cool"
                onClick={() => setSidebarOpen(false)}
              >
                <User className="h-4 w-4" aria-hidden="true" />
                Profile
              </Link>
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => {
                  setSidebarOpen(false);
                  logout();
                }}
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Log out
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}