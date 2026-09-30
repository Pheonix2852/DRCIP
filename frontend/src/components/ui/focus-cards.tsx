import { motion } from "motion/react"
import { Link } from "react-router-dom"
import { ArrowRight } from "lucide-react"
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
 * Image card grid used for the public homepage Role entry. Cards are opaque
 * Links; hover/focus un-blurs the image and reveals the call to action.
 */
export function FocusCards({ cards, className }: FocusCardsProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4",
        className,
      )}
    >
      {cards.map((card, idx) => (
        <motion.div
          key={card.title}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.45, delay: idx * 0.06 }}
          className="min-w-0"
        >
          <Link
            to={card.link}
            data-testid="role-card"
            className="group relative block h-full overflow-hidden rounded-drcip-md border border-border bg-surface shadow-drcip-sm transition-shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-electric hover:shadow-drcip-md"
          >
            <div className="relative aspect-[4/5] w-full overflow-hidden">
              <img
                src={card.src}
                alt=""
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover transition-all duration-500 ease-out group-focus:scale-100 group-focus:blur-0 group-hover:scale-100 group-hover:blur-0 motion-reduce:scale-100 motion-reduce:blur-0"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/20 to-transparent opacity-90 transition-opacity group-hover:opacity-100 group-focus:opacity-100"
              />
            </div>
            <div className="absolute inset-x-0 bottom-0 p-4">
              <h3 className="text-base font-semibold text-white">{card.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-white/80">{card.description}</p>
              <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-white opacity-80 transition-opacity group-hover:opacity-100 group-focus:opacity-100">
                Sign In <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
              </span>
            </div>
          </Link>
        </motion.div>
      ))}
    </div>
  )
}