import type { ReactNode } from 'react'
import { cn } from '../lib/utils'

export interface PageHeaderProps {
  title: string
  description?: string
  meta?: ReactNode
  actions?: ReactNode
  className?: string
}

/**
 * Shared operational page header: Manrope title, contextual description,
 * optional technical metadata and header-level actions.
 */
export function PageHeader({ title, description, meta, actions, className }: PageHeaderProps) {
  return (
    <header className={cn('mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        {meta && <p className="mt-1.5 font-mono text-xs text-muted">{meta}</p>}
      </div>
      {actions && <div className="flex flex-shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}