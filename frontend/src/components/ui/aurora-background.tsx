import { cn } from '@/lib/utils'

interface AuroraBackgroundProps {
  className?: string
}

/**
 * Homepage-only decorative aurora wash — approved gradient exception (§5.4.1).
 * Renders a full-page backdrop of drifting cobalt washes based on the supplied
 * Aceternity aurora layer (animated repeating diagonal gradient, blurred and
 * radially masked), re-coloured to the DRCIP homepage palette.
 *
 * Purely decorative: `aria-hidden`, inert to pointer input, and CSS-animated so
 * `prefers-reduced-motion` freezes it via the `.drcip-home` stylesheet override.
 * Mounted only on `HomePage` (never the authenticated shell or auth routes).
 */
export function AuroraBackground({ className }: AuroraBackgroundProps) {
  return (
    <div aria-hidden="true" className={cn('pointer-events-none overflow-hidden', className)}>
      <div className="drcip-aurora-base" />
      <div className="drcip-aurora-wash" />
    </div>
  )
}