import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * Homepage bento presentation grid. Cells carry the surface-frame styling of
 * the DRCIP demo panels they host; only layout/spanning is managed here.
 */
export function BentoGrid({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3", className)}>{children}</div>
}

export function BentoGridItem({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return <div className={cn("min-w-0", className)}>{children}</div>
}