import { motion, useReducedMotion } from "motion/react"
import { cn } from "@/lib/utils"

export interface TypeWord {
  text: string
  className?: string
}

export interface TypewriterEffectSmoothProps {
  words: TypeWord[]
  className?: string
  cursorClassName?: string
}

/**
 * Homepage final-CTA centerpiece, adapted from the supplied Aceternity
 * TypewriterEffectSmooth: the line types in left-to-right via a width
 * reveal, with a blinking cobalt cursor beside it. Replays whenever the
 * component enters the viewport. `prefers-reduced-motion` renders the full line immediately
 * with a static cursor.
 */
export function TypewriterEffectSmooth({
  words,
  className,
  cursorClassName,
}: TypewriterEffectSmoothProps) {
  const reduceMotion = useReducedMotion()
  const label = words.map((word) => word.text).join(" ")

  return (
    <div className={cn("flex items-center justify-center gap-x-1", className)} aria-label={label}>
      <motion.div
        initial={reduceMotion ? { width: "fit-content" } : { width: "0%" }}
        whileInView={{ width: "fit-content" }}
        viewport={{ once: false, amount: 0.6 }}
        transition={reduceMotion ? { duration: 0 } : { duration: 2, ease: "linear", delay: 0.3 }}
        className="overflow-hidden pb-1"
        aria-hidden="true"
      >
        <div className="home-h2 flex whitespace-nowrap">
          {words.map((word, idx) => (
            <span key={idx} className={cn("inline-block", word.className)}>
              {word.text}
              {idx < words.length - 1 ? "\u00A0" : ""}
            </span>
          ))}
        </div>
      </motion.div>
      <motion.span
        aria-hidden="true"
        initial={{ opacity: reduceMotion ? 1 : 0.2 }}
        animate={reduceMotion ? { opacity: 1 } : { opacity: [0.2, 1, 0.2] }}
        transition={reduceMotion ? { duration: 0 } : { duration: 1, repeat: Infinity, ease: "easeInOut" }}
        className={cn("inline-block h-[0.85em] w-[3px] shrink-0 rounded-sm bg-cobalt-electric", cursorClassName)}
      />
    </div>
  );
}
