import { cn } from "@/lib/utils"

interface LoaderProps {
  label?: string
  className?: string
  dotsClassName?: string
}

/**
 * DRCIP brand loading mark — three cobalt dots rising in sequence.
 * CSS-driven so it respects `prefers-reduced-motion` at the stylesheet level.
 */
export function Loader({ label, className, dotsClassName }: LoaderProps) {
  return (
    <div role="status" className={cn("flex items-center gap-2 text-sm text-muted", className)}>
      <span className={cn("inline-flex items-center gap-1", dotsClassName)} aria-hidden="true">
        <span className="drcip-loader-dot h-1.5 w-1.5 rounded-full bg-cobalt-deep" />
        <span className="drcip-loader-dot h-1.5 w-1.5 rounded-full bg-cobalt-deep [animation-delay:0.15s]" />
        <span className="drcip-loader-dot h-1.5 w-1.5 rounded-full bg-cobalt-deep [animation-delay:0.3s]" />
      </span>
      {label ? <span>{label}</span> : null}
    </div>
  )
}