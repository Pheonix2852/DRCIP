import * as React from "react"
import { cn } from "../../lib/utils"

export interface SheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}

export function Sheet({ open, onOpenChange, children }: SheetProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 bg-black/50" onClick={() => onOpenChange(false)}>
      <div onClick={e => e.stopPropagation()}>{children}</div>
    </div>
  )
}

export function SheetContent({ children, className }: { children: React.ReactNode, className?: string }) {
  return (
    <div className={cn("fixed inset-y-0 left-0 z-50 w-3/4 bg-white p-6 shadow-lg transition ease-in-out sm:max-w-sm", className)}>
      {children}
    </div>
  )
}