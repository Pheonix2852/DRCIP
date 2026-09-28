import { cn } from '../lib/utils'

/** Maps operational status strings to DESIGN_SYSTEM status tones. */
const STATUS_TONE: Record<string, { tone: string; label?: string }> = {
  /* success */
  ACTIVE: { tone: 'success' },
  AVAILABLE: { tone: 'success' },
  RESOLVED: { tone: 'success' },
  COMPLETED: { tone: 'success' },
  SENT: { tone: 'success' },
  SUCCESS: { tone: 'success' },
  OK: { tone: 'success' },
  ON: { tone: 'success' },
  TRUE: { tone: 'success', label: 'Active' },
  /* warning */
  MAINTENANCE: { tone: 'warning' },
  FULL: { tone: 'warning' },
  PENDING: { tone: 'warning' },
  TRIAGE_PENDING: { tone: 'warning' },
  CANCELLED: { tone: 'warning' },
  /* info */
  DEPLOYED: { tone: 'info' },
  IN_RESPONSE: { tone: 'info' },
  REPORTED: { tone: 'info' },
  IN_PROGRESS: { tone: 'info' },
  ASSIGNED: { tone: 'info' },
  RESERVED: { tone: 'info' },
  PARTIAL: { tone: 'info' },
  /* error */
  UNAVAILABLE: { tone: 'error' },
  FAILED: { tone: 'error' },
  ERROR: { tone: 'error' },
  OFFLINE: { tone: 'error' },
  FALSE: { tone: 'unavailable', label: 'Inactive' },
  /* unavailable / neutral */
  INACTIVE: { tone: 'unavailable' },
  ARCHIVED: { tone: 'unavailable' },
  CLOSED: { tone: 'unavailable' },
  UNKNOWN: { tone: 'unavailable' },
}

const TONE_CLASSES: Record<string, string> = {
  success: 'bg-status-success/10 text-status-success',
  warning: 'bg-status-warning/10 text-status-warning',
  info: 'bg-status-info/10 text-status-info',
  error: 'bg-status-error/10 text-status-error',
  unavailable: 'bg-status-unavailable/10 text-status-unavailable',
}

function normalizedKey(status: string | boolean): string {
  const s = typeof status === 'boolean' ? String(status) : status.trim()
  return s.toUpperCase()
}

function humanize(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export interface StatusBadgeProps {
  status: string | boolean
  label?: string
  className?: string
}

/**
 * Compact operational status badge. Colour alone is never the only signal:
 * a status dot and readable label always accompany the tone.
 */
export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const key = normalizedKey(status)
  const entry = STATUS_TONE[key]
  const tone = entry?.tone ?? 'unavailable'
  const text = label ?? entry?.label ?? humanize(key)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-drcip-md px-2 py-0.5 text-xs font-medium',
        TONE_CLASSES[tone],
        className,
      )}
      data-testid="status-badge"
    >
      <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full bg-current')} />
      <span>{text}</span>
    </span>
  )
}