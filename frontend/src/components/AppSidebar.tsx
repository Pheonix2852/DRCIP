import { Link } from "react-router-dom"
import { LogOut, User, X } from "lucide-react"
import { useAuth } from "../contexts/AuthContext"
import { Button } from "./ui/button"
import { Sheet, SheetContent } from "./ui/sheet"
import { ALL_ROLES, NavItemLink, ROLE_LABELS, renderRoleGroups } from "./app-nav"
import drcipLockup from "../assets/brand/drcip-lockup.png"

interface AppSidebarProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * The single role-aware application sidebar. It renders the desktop aside and
 * the mobile sheet, both driven by the shared NAV_GROUPS schema.
 */
export function AppSidebar({ open, onOpenChange }: AppSidebarProps) {
  const { user, logout } = useAuth()
  const role = user?.role as keyof typeof ROLE_LABELS | undefined
  const roleLabel = role ? (ROLE_LABELS[role] ?? role) : null

  const close = () => onOpenChange(false)

  return (
    <>
      <aside className="hidden w-60 shrink-0 border-r border-border bg-surface md:block">
        <nav aria-label="Primary" className="sticky top-16 max-h-[calc(100vh-4rem)] overflow-y-auto px-3 py-4">
          <ul className="space-y-0.5">
            <li>
              <NavItemLink item={{ label: "Home", to: "/", roles: ALL_ROLES, end: true }} />
            </li>
          </ul>
          {user ? renderRoleGroups(user.role) : null}
        </nav>
      </aside>

      <Sheet open={open} onOpenChange={onOpenChange} label="Navigation">
        <SheetContent className="p-0">
          <div className="flex h-full flex-col">
            <div className="flex h-16 items-center justify-between border-b border-border px-4">
              <img src={drcipLockup} alt="DRCIP" className="h-8 w-auto" />
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11"
                onClick={close}
                aria-label="Close navigation menu"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </Button>
            </div>

            {user && roleLabel && (
              <div className="border-b border-border px-4 py-3">
                <p className="text-sm font-medium text-ink">{user.name}</p>
                <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wider text-text-muted">
                  {roleLabel}
                </p>
              </div>
            )}

            <nav aria-label="Mobile navigation" className="flex-1 overflow-y-auto px-3 pb-4">
              <ul className="space-y-0.5 pt-3">
                <li>
                  <NavItemLink
                    item={{ label: "Home", to: "/", roles: ALL_ROLES, end: true }}
                    onNavigate={close}
                  />
                </li>
              </ul>
              {user ? renderRoleGroups(user.role, close) : null}
            </nav>

            <div className="flex gap-2 border-t border-border p-3">
              <Link
                to="/profile"
                className="flex flex-1 items-center justify-center gap-2 rounded-drcip-md border border-border py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-cool"
                onClick={close}
              >
                <User className="h-4 w-4" aria-hidden="true" />
                Profile
              </Link>
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => {
                  close()
                  logout()
                }}
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Log out
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}