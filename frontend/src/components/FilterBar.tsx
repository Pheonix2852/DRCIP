import { cn } from "@/lib/utils"

export function FilterBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-6", className)}>{children}</div>
}
