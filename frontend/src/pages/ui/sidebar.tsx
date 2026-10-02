import { createContext, useContext, useState, type ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"
import { Link } from "react-router-dom"
import { cn } from "@/lib/utils"

interface SidebarContextValue {
  open: boolean
  setOpen: (open: boolean) => void
  animate: boolean
}

/** Outside a Sidebar (e.g. the mobile sheet) labels are always visible. */
const SidebarContext = createContext<SidebarContextValue>({
  open: true,
  setOpen: () => {},
  animate: true,
})

export function useSidebar() {
  return useContext(SidebarContext)
}

interface SidebarProps {
  children: ReactNode
  className?: string
}

/**
 * Desktop sidebar shell: an icon rail that expands on hover with an animated
 * width, mirroring the Aceternity sidebar. The mobile nav keeps the sheet.
 */
export function Sidebar({ children, className }: SidebarProps) {
  const [open, setOpen] = useState(false)
  const reduceMotion = useReducedMotion()
  const animate = !reduceMotion

  return (
    <SidebarContext.Provider value={{ open, setOpen, animate }}>
      <motion.aside
        aria-label="Primary"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        initial={false}
        animate={{ width: animate ? (open ? 300 : 68) : 300 }}
        transition={{ duration: 0.3, ease: "easeInOut" }}
        className={cn(
          "sticky top-16 hidden h-[calc(100vh-4rem)] shrink-0 flex-col overflow-hidden border-r border-border bg-surface md:flex",
          className,
        )}
      >
        {children}
      </motion.aside>
    </SidebarContext.Provider>
  )
}

export function SidebarBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-1 flex-col gap-1 overflow-x-hidden overflow-y-auto px-3 py-4", className)}>
      {children}
    </div>
  )
}

/** Group title when open; a divider separator when collapsed to the rail. */
export function SidebarHeading({ children, className }: { children: ReactNode; className?: string }) {
  const { open, animate } = useSidebar()
  if (!open && animate) {
    return <div aria-hidden="true" className={cn("mx-3 my-2 h-px bg-border", className)} />
  }
  return (
    <p className={cn("px-3 pb-1 pt-5 font-mono text-[11px] uppercase tracking-wider text-text-muted", className)}>
      {children}
    </p>
  )
}

interface SidebarLinkProps {
  label: string
  to: string
  icon: ReactNode
  active?: boolean
  onNavigate?: () => void
  className?: string
}

/** Nav link whose label collapses away with the rail; always an accessible Link. */
export function SidebarLink({ label, to, icon, active, onNavigate, className }: SidebarLinkProps) {
  const { open, animate } = useSidebar()
  return (
    <Link
      to={to}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={!open && animate ? label : undefined}
      className={cn(
        "group/sidebar flex items-center rounded-drcip-md py-2.5 transition-colors",
        open ? "gap-3 justify-start px-3" : "justify-center",
        active
          ? "bg-surface-cool font-medium text-ink"
          : "text-text-secondary hover:bg-surface-cool hover:text-ink",
        className,
      )}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-cobalt-deep">{icon}</span>
      <motion.span
        animate={{
          display: animate ? (open ? "inline-block" : "none") : "inline-block",
          opacity: animate ? (open ? 1 : 0) : 1,
        }}
        className="truncate text-sm whitespace-pre transition-transform duration-150 group-hover/sidebar:translate-x-1"
      >
        {label}
      </motion.span>
    </Link>
  )
}