import { cn } from "@/lib/utils"

export interface MovingCardItem {
  quote: string
  name: string
  title: string
}

interface InfiniteMovingCardsProps {
  items: MovingCardItem[]
  direction?: "left" | "right"
  speed?: "fast" | "normal" | "slow"
  pauseOnHover?: boolean
  className?: string
}

const SPEEDS = { fast: "30s", normal: "50s", slow: "72s" }

/**
 * Marquee driven by the CSS `scroll` keyframes (translateX -50%). Content is
 * rendered twice so the loop is seamless. Frozen entirely under reduced motion.
 */
export function InfiniteMovingCards({
  items,
  direction = "left",
  speed = "fast",
  pauseOnHover = true,
  className,
}: InfiniteMovingCardsProps) {
  const loop = [...items, ...items]
  return (
    <div
      className={cn(
        "overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]",
        className,
      )}
    >
      <ul
        className={cn(
          "flex w-max flex-nowrap items-stretch gap-6 py-4",
          direction === "right" && "[animation-direction:reverse]",
          pauseOnHover && "group-hover:[animation-play-state:paused]",
          "animate-scroll motion-reduce:[animation:none]",
        )}
        style={{ "--scroll-duration": SPEEDS[speed] } as React.CSSProperties}
      >
        {loop.map((item, idx) => (
          <li
            key={`${item.name}-${idx}`}
            className="w-[min(20rem,82vw)] shrink-0 rounded-drcip-md border border-border bg-surface p-5 shadow-drcip-sm"
          >
            <blockquote>
              <p className="text-sm leading-relaxed text-ink">“{item.quote}”</p>
              <footer className="mt-4 flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    idx % 2 === 0 ? "bg-cobalt-deep" : "bg-cobalt-electric",
                  )}
                />
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-ink">{item.name}</p>
                  <p className="truncate font-mono text-[11px] uppercase tracking-wider text-text-muted">
                    {item.title}
                  </p>
                </div>
              </footer>
            </blockquote>
          </li>
        ))}
      </ul>
    </div>
  )
}