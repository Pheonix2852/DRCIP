import type { ReactNode } from 'react'
import { cn } from '../lib/utils'

export interface EmptyStateProps {
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

/** Legitimate zero-data state with an optional primary action. */
export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div
      role="status"
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-drcip-lg border border-dashed border-border bg-surface px-6 py-12 text-center',
        className,
      )}
    >
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}