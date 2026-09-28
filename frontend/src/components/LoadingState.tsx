import { cn } from '../lib/utils'

export interface LoadingStateProps {
  label?: string
  className?: string
}

/** Restrained DRCIP loading treatment — small pulse, never a big spinner. */
export function LoadingState({ label = 'Loading…', className }: LoadingStateProps) {
  return (
    <div role="status" className={cn('flex items-center gap-2 text-sm text-muted', className)}>
      <span
        aria-hidden="true"
        className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-border border-t-cobalt-deep"
      />
      <span>{label}</span>
    </div>
  )
}