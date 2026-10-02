import * as React from "react"
import { motion, useMotionTemplate, useMotionValue } from "motion/react"
import { cn } from "../../lib/utils"

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

/**
 * Aceternity motion Input adapted to DRCIP tokens: a radial cobalt glow
 * follows the pointer across the field border, and a gradient underline
 * appears on keyboard focus. Visual treatment only — the native input, its
 * a11y focus ring and all form behavior are unchanged. Consumer `className`
 * is applied to the wrapper so layout sizing still wraps the whole control.
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    const radius = 80
    const [visible, setVisible] = React.useState(false)
    const mouseX = useMotionValue(0)
    const mouseY = useMotionValue(0)

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
      const el = e.currentTarget
      const rect = el.getBoundingClientRect()
      mouseX.set(e.clientX - rect.left)
      mouseY.set(e.clientY - rect.top)
    }

    return (
      <motion.div
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        style={{
          background: useMotionTemplate`radial-gradient(${visible ? radius + "px" : "0px"} circle at ${mouseX}px ${mouseY}px, var(--brand-cobalt-electric), transparent 80%)`,
        }}
        className={cn("relative w-full rounded-lg p-[2px] transition duration-300", className)}
      >
        <input
          type={type}
          className="peer flex h-10 w-full rounded-md border-none bg-background px-3 py-2 text-sm text-ink placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cobalt-electric focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 file:border-0 file:bg-transparent file:text-sm file:font-medium"
          ref={ref}
          {...props}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-2 -bottom-px h-px bg-gradient-to-r from-transparent via-cobalt-electric to-transparent opacity-0 transition-opacity duration-300 peer-focus-visible:opacity-100"
        />
      </motion.div>
    )
  }
)
Input.displayName = "Input"