import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Bell,
  Bot,
  Boxes,
  ClipboardCheck,
  ClipboardList,
  Crosshair,
  FileText,
  History,
  Hospital,
  LayoutDashboard,
  LogOut,
  Menu,
  Radio,
  ScrollText,
  Shield,
  Siren,
  User,
  UserRound,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useRealtime } from "../hooks/useRealtime";
import { notifications } from "../lib/notifications";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Sheet, SheetContent } from "./ui/sheet";
import { Sidebar, SidebarBody, SidebarHeading, SidebarLink } from "./ui/sidebar";
import drcipLockup from "../assets/brand/drcip-lockup.png";

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
  icon: LucideIcon;
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
      { label: "Report Incident", to: "/report", roles: ["CITIZEN", "FIELD_OFFICER"], icon: Siren },
      { label: "My Incidents", to: "/incidents", roles: ["CITIZEN"], icon: FileText },
    ],
  },
  {
    title: "Field Operations",
    items: [
      { label: "Field Dashboard", to: "/field", roles: ["FIELD_OFFICER"], end: true, icon: LayoutDashboard },
      { label: "My Team", to: "/field/team", roles: ["FIELD_OFFICER"], icon: UserRound },
      { label: "My Assignments", to: "/field/assignments", roles: ["FIELD_OFFICER"], icon: ClipboardCheck },
      { label: "Field Update", to: "/field/update", roles: ["FIELD_OFFICER"], icon: Radio },
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
        icon: Crosshair,
      },
      { label: "Assignments", to: "/assignments", roles: ["DISASTER_COORDINATOR", "ADMINISTRATOR"], icon: ClipboardList },
      { label: "Resources", to: "/resources", roles: ["FIELD_OFFICER", "DISASTER_COORDINATOR", "ADMINISTRATOR"], icon: Boxes },
      { label: "Teams", to: "/teams", roles: ["DISASTER_COORDINATOR", "ADMINISTRATOR"], icon: Users },
      { label: "Shelters", to: "/shelters", roles: ["DISASTER_COORDINATOR", "ADMINISTRATOR"], icon: Hospital },
    ],
  },
  {
    title: "Reports & Intelligence",
    items: [
      { label: "Reports", to: "/reports", roles: ["DISASTER_COORDINATOR", "ADMINISTRATOR"], icon: ScrollText },
      {
        label: "RAG Assistant",
        to: "/rag",
        roles: ["FIELD_OFFICER", "DISASTER_COORDINATOR", "ADMINISTRATOR"],
        // The Administrator RAG surface lives at /admin/rag.
        activePrefixes: ["/admin/rag"],
        icon: Bot,
      },
    ],
  },
  {
    title: "Administration",
    items: [
      { label: "Overview", to: "/admin", roles: ["ADMINISTRATOR"], end: true, icon: Shield },
      { label: "Users", to: "/admin/users", roles: ["ADMINISTRATOR"], icon: Users },
      { label: "Audit Log", to: "/admin/audit", roles: ["DISASTER_COORDINATOR", "ADMINISTRATOR"], icon: History },
      { label: "System Health", to: "/admin/health", roles: ["ADMINISTRATOR"], icon: Activity },
    ],
  },
];

function NavItemLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const location = useLocation();
  // Mirrors react-router NavLink matching (including the end-slash boundary guard),
  // plus the extra activePrefixes so aria-current tracks the visual active state.
  const endSlash = item.to !== "/" && item.to.endsWith("/") ? item.to.length - 1 : item.to.length;
  const matched =
    location.pathname === item.to ||
    (!item.end && location.pathname.startsWith(item.to) && location.pathname.charAt(endSlash) === "/");
  const isActive =
    matched || (item.activePrefixes?.some((prefix) => location.pathname.startsWith(prefix)) ?? false);
  return (
    <SidebarLink
      label={item.label}
      to={item.to}
      icon={<item.icon className="h-5 w-5" aria-hidden="true" />}
      active={isActive}
      onNavigate={onNavigate}
    />
  );
}

function renderGroups(role: string, onNavigate?: () => void) {
  return NAV_GROUPS.map((group) => {
    const items = group.items.filter((item) => item.roles.includes(role));
    if (items.length === 0) return null;
    return (
      <div key={group.title}>
        <SidebarHeading>{group.title}</SidebarHeading>
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

  const { data: unreadData } = useQuery({
    queryKey: ["notifications"],
    enabled: !!user,
    queryFn: () => notifications.list({ unread_only: "true", limit: 1 }),
    // The badge is WS-driven; if a frame is ever missed the count could go
    // stale indefinitely. REST is authoritative, so reconcile from the API
    // whenever the window regains focus or the network reconnects.
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  const unreadCount = unreadData?.pagination?.total ?? 0;

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
        <Sidebar>
          <SidebarBody>
            {user ? renderGroups(user.role) : null}
          </SidebarBody>
        </Sidebar>

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
                <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wider text-text-muted">{roleLabel}</p>
              </div>
            )}

            <nav aria-label="Mobile navigation" className="flex-1 overflow-y-auto px-3 pb-4">
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