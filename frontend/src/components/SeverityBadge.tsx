import { AlertOctagon, AlertTriangle, Info, Circle } from 'lucide-react'
import { severityTone } from '../lib/severityColor'
import { cn } from '../lib/utils'

const SEVERITY_ICON: Record<string, typeof AlertTriangle> = {
  CRITICAL: AlertOctagon,
  HIGH: AlertTriangle,
  MEDIUM: Info,
  LOW: Circle,
}

function normalize(severity?: string): string {
  return severity?.trim().toUpperCase() ?? ''
}

export interface SeverityBadgeProps {
  severity?: string
  /** Optional field name, e.g. `label="Priority"` renders "Priority: HIGH". */
  label?: string
  className?: string
}

/**
 * Severity badge — icon + read-only label + DESIGN_SYSTEM severity tone.
 * Meaning is never carried by colour alone.
 */
export function SeverityBadge({ severity, label, className }: SeverityBadgeProps) {
  const key = normalize(severity)
  const Icon = SEVERITY_ICON[key] ?? Circle
  const text = label ? `${label}: ${key || 'Unknown'}` : key || 'Unknown'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-drcip-md px-2 py-0.5 text-xs font-medium',
        severityTone(key),
        className,
      )}
      data-testid="severity-badge"
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      <span>{text}</span>
    </span>
  )
}