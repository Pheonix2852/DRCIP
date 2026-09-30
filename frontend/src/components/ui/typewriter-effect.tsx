import { motion } from "motion/react"
import { cn } from "@/lib/utils"

export interface TypeWord {
  text: string
  className?: string
}

export interface TypewriterEffectProps {
  words: TypeWord[]
  className?: string
  cursorClassName?: string
}

/**
 * Word-by-word reveal with a blinking cursor. Triggers once when scrolled
 * into view. `prefers-reduced-motion` is handled by the `whileInView` motor
 * only animating opacity (no movement) in that mode via the CSS override.
 */
export function TypewriterEffect({ words, className, cursorClassName }: TypewriterEffectProps) {
  return (
    <p
      className={cn("flex flex-wrap items-center justify-center gap-x-1 text-lg md:text-2xl", className)}
      aria-label={words.map((word) => word.text).join(" ")}
    >
      {words.map((word, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.35, delay: i * 0.08 }}
          className={cn("typewriter-word", word.className)}
        >
          {word.text}
        </motion.span>
      ))}
      <motion.span
        aria-hidden="true"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        className={cn("typewriter-cursor", cursorClassName)}
      >
        |
      </motion.span>
    </p>
  )
}