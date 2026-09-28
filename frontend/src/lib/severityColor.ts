const SEVERITY_TONES: Record<string, { color: string; classes: string }> = {
  CRITICAL: {
    color: '#B42318',
    classes: 'bg-severity-critical/10 text-severity-critical',
  },
  HIGH: {
    color: '#C2410C',
    classes: 'bg-severity-high/10 text-severity-high',
  },
  MEDIUM: {
    color: '#A16207',
    classes: 'bg-severity-medium/10 text-severity-medium',
  },
  LOW: {
    color: '#475467',
    classes: 'bg-severity-low/10 text-severity-low',
  },
}

const FALLBACK_TONE = {
  color: '#667085',
  classes: 'bg-status-unavailable/10 text-status-unavailable',
}

function normalize(severity?: string): string | null {
  const s = severity?.trim().toUpperCase()
  return s ? s : null
}

/** Hex colour for a severity level — DESIGN_SYSTEM §5.2 exact values. */
export function severityColor(severity?: string): string {
  const s = normalize(severity)
  return (s ? SEVERITY_TONES[s] : undefined)?.color ?? FALLBACK_TONE.color
}

/** Tailwind tone classes for a severity level (badges, chips). */
export function severityTone(severity?: string): string {
  const s = normalize(severity)
  return (s ? SEVERITY_TONES[s] : undefined)?.classes ?? FALLBACK_TONE.classes
}