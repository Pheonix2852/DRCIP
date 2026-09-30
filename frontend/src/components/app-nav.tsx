import { Link, useLocation } from "react-router-dom"
import { cn } from "../lib/utils"

export type Role = "CITIZEN" | "FIELD_OFFICER" | "DISASTER_COORDINATOR" | "ADMINISTRATOR"

export const ALL_ROLES: Role[] = [
  "CITIZEN",
  "FIELD_OFFICER",
  "DISASTER_COORDINATOR",
  "ADMINISTRATOR",
]

export const ROLE_LABELS: Record<Role, string> = {
  CITIZEN: "Citizen",
  FIELD_OFFICER: "Field Officer",
  DISASTER_COORDINATOR: "Disaster Coordinator",
  ADMINISTRATOR: "Administrator",
}

export interface NavItem {
  label: string
  to: string
  roles: Role[]
  end?: boolean
  /** Extra path prefixes that should also activate this item. */
  activePrefixes?: string[]
}

export interface NavGroup {
  title: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
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
]

export function NavItemLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const location = useLocation()
  // Mirrors react-router NavLink matching (including the end-slash boundary guard),
  // plus the extra activePrefixes so aria-current tracks the visual active state.
  const endSlash = item.to !== "/" && item.to.endsWith("/") ? item.to.length - 1 : item.to.length
  const matched =
    location.pathname === item.to ||
    (!item.end && location.pathname.startsWith(item.to) && location.pathname.charAt(endSlash) === "/")
  const isActive =
    matched || (item.activePrefixes?.some((prefix) => location.pathname.startsWith(prefix)) ?? false)
  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "group relative flex items-center rounded-drcip-md px-3 py-2 text-sm transition-colors",
        isActive
          ? "bg-surface font-medium text-ink shadow-drcip-sm"
          : "text-text-secondary hover:bg-surface-cool hover:text-ink",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-cobalt-deep transition-opacity",
          isActive ? "opacity-100" : "opacity-0",
        )}
      />
      <span className="truncate">{item.label}</span>
    </Link>
  )
}

export function rolesForGroup(group: NavGroup, role: string): NavItem[] {
  return group.items.filter((item) => item.roles.includes(role as Role))
}

/** Renders the role-filtered nav groups (returned as a fragment of blocks). */
export function renderRoleGroups(role: string, onNavigate?: () => void) {
  return NAV_GROUPS.map((group) => {
    const items = rolesForGroup(group, role)
    if (items.length === 0) return null
    return (
      <div key={group.title}>
        <p className="px-3 pb-1 pt-5 font-mono text-[11px] uppercase tracking-wider text-text-muted">
          {group.title}
        </p>
        <ul className="space-y-0.5">
          {items.map((item) => (
            <li key={item.to}>
              <NavItemLink item={item} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
      </div>
    )
  })
}