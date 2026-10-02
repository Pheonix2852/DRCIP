import { useState } from "react"
import { Link } from "react-router-dom"
import { cn } from "@/lib/utils"

export interface FocusCardItem {
  title: string
  description: string
  src: string
  link: string
}

interface FocusCardsProps {
  cards: FocusCardItem[]
  className?: string
}

/**
 * Aceternity Focus Cards adapted for DRCIP: hovering or focusing one card
 * blurs and shrinks its siblings, while the active card reveals its title,
 * description and call to action over the image.
 */
export function FocusCards({ cards, className }: FocusCardsProps) {
  const [hovered, setHovered] = useState<number | null>(null)

  return (
    <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {cards.map((card, index) => (
        <Link
          key={card.title}
          to={card.link}
          data-testid="role-card"
          onFocus={() => setHovered(index)}
          onBlur={() => setHovered(null)}
          onMouseEnter={() => setHovered(index)}
          onMouseLeave={() => setHovered(null)}
          className={cn(
            "group relative block h-72 w-full overflow-hidden rounded-drcip-md border border-border bg-surface shadow-drcip-sm transition-all duration-300 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-electric motion-reduce:transition-none",
            hovered !== null && hovered !== index && "blur-sm scale-[0.98] motion-reduce:blur-none motion-reduce:scale-100",
          )}
        >
          <img src={card.src} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
          <div
            className={cn(
              "absolute inset-0 flex flex-col justify-end bg-ink/60 p-4 pt-20 transition-opacity duration-300 motion-reduce:transition-none",
              hovered === index ? "opacity-100" : "opacity-0",
            )}
          >
            <h3 className="text-base font-semibold text-white">{card.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-white/80">{card.description}</p>
            <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-white">
              Sign In <span aria-hidden="true">→</span>
            </span>
          </div>
        </Link>
      ))}
    </div>
  )
}