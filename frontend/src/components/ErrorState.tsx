import { TriangleAlert } from 'lucide-react'
import { cn } from '../lib/utils'
import { Button } from '../pages/ui/button'

export interface ErrorStateProps {
  title?: string
  description?: string
  retry?: () => void
  className?: string
}

/** Recoverable UI error with an optional retry action. */
export function ErrorState({
  title = 'Something went wrong',
  description,
  retry,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-drcip-lg border border-status-error/20 bg-surface px-6 py-12 text-center',
        className,
      )}
    >
      <TriangleAlert aria-hidden="true" className="h-6 w-6 text-status-error" />
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {retry && (
        <Button variant="outline" size="sm" type="button" onClick={retry} className="mt-2">
          Try again
        </Button>
      )}
    </div>
  )
}