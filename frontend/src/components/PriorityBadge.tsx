import { cn } from "@/lib/utils"

const tones = {
  HIGH: 'bg-status-error/10 text-status-error',
  MEDIUM: 'bg-status-warning/10 text-status-warning',
  LOW: 'bg-status-unavailable/10 text-status-unavailable',
}

export function PriorityBadge({ priority }: { priority: 'HIGH' | 'MEDIUM' | 'LOW' }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-drcip-md px-2 py-0.5 text-xs font-medium', tones[priority])}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {priority}
    </span>
  )
}