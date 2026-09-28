import type { ReactNode } from 'react'
import { WifiOff, CloudOff, TriangleAlert } from 'lucide-react'
import { cn } from '../lib/utils'

export type UnavailableTone = 'unavailable' | 'degraded' | 'provider'

const TONE_PRESETS: Record<
  UnavailableTone,
  { icon: typeof WifiOff; iconClass: string; borderClass: string }
> = {
  unavailable: { icon: WifiOff, iconClass: 'text-status-unavailable', borderClass: 'border-status-unavailable/20' },
  degraded: { icon: TriangleAlert, iconClass: 'text-status-warning', borderClass: 'border-status-warning/25' },
  provider: { icon: CloudOff, iconClass: 'text-status-warning', borderClass: 'border-status-warning/25' },
}

export interface UnavailableStateProps {
  title: string
  description?: string
  tone?: UnavailableTone
  action?: ReactNode
  className?: string
}

/**
 * Service/feature unavailable or degraded — explicitly NOT an alert/error.
 * Presents the honest state and an available manual path when supplied.
 */
export function UnavailableState({ title, description, tone = 'unavailable', action, className }: UnavailableStateProps) {
  const preset = TONE_PRESETS[tone]
  const Icon = preset.icon
  return (
    <div
      role="status"
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-drcip-lg border bg-surface px-6 py-10 text-center',
        preset.borderClass,
        className,
      )}
    >
      <Icon aria-hidden="true" className={cn('h-6 w-6', preset.iconClass)} />
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}