import * as React from "react"
import { cn } from "../../lib/utils"

export interface SheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
  label?: string
}

export function Sheet({ open, onOpenChange, children, label = "Navigation" }: SheetProps) {
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, onOpenChange])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex" role="presentation">
      <div
        aria-hidden="true"
        className="sheet-backdrop absolute inset-0 bg-black/50"
        onClick={() => onOpenChange(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="relative z-10"
      >
        <div className="h-full">{children}</div>
      </div>
    </div>
  )
}

export function SheetContent({ children, className }: { children: React.ReactNode, className?: string }) {
  return (
    <div
      className={cn(
        "sheet-panel fixed inset-y-0 left-0 z-50 flex w-[min(20rem,85vw)] flex-col overflow-y-auto bg-surface shadow-drcip-lg",
        className,
      )}
    >
      {children}
    </div>
  )
}