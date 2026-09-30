import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * Aceternity BentoGrid adapted to the DRCIP design system. A 3-column bento
 * grid where items may span columns/rows to create a mixed-sized layout.
 */
export function BentoGrid({ className, children }: { className?: string; children?: ReactNode }) {
  return <div className={cn("mx-auto grid w-full grid-cols-1 gap-4 md:auto-rows-[18rem] md:grid-cols-3", className)}>{children}</div>
}

interface BentoGridItemProps {
  className?: string
  title?: ReactNode
  description?: ReactNode
  header?: ReactNode
  icon?: ReactNode
}

export function BentoGridItem({ className, title, description, header, icon }: BentoGridItemProps) {
  return (
    <div
      className={cn(
        "group/bento row-span-1 flex flex-col justify-between space-y-4 overflow-hidden rounded-drcip-lg border border-border bg-surface p-5 shadow-drcip-md transition duration-200 hover:shadow-xl",
        className,
      )}
    >
      {header}
      <div className="transition duration-200 group-hover/bento:translate-x-2">
        {icon}
        <div className="mt-3 mb-2 font-sans text-lg font-medium tracking-tight text-ink">{title}</div>
        <div className="font-sans text-sm leading-relaxed text-text-secondary">{description}</div>
      </div>
    </div>
  )
}