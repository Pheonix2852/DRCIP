import { useCallback, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import { motion, useMotionTemplate, useMotionValue } from "motion/react"
import { cn } from "@/lib/utils"

interface MaskContainerProps {
  children: ReactNode
  className?: string
  radius?: number
}

/**
 * Pointer-following CSS radial mask used for the editorial "image reveal" on
 * the public homepage. The masked layer stays centered (fully visible) when
 * no pointer is present or motion is reduced.
 */
export function MaskContainer({ children, className, radius = 260 }: MaskContainerProps) {
  const ref = useRef<HTMLDivElement>(null)
  const mx = useMotionValue(50)
  const my = useMotionValue(50)
  const maskImage = useMotionTemplate`radial-gradient(circle at ${mx}% ${my}%, black 0%, black ${(radius / 8).toFixed(0)}px, transparent ${(radius / 5).toFixed(0)}%)`

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const el = ref.current
      if (!el) return
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
      const rect = el.getBoundingClientRect()
      mx.set(((e.clientX - rect.left) / rect.width) * 100)
      my.set(((e.clientY - rect.top) / rect.height) * 100)
    },
    [mx, my],
  )

  return (
    <div
      ref={ref}
      onPointerMove={onPointerMove}
      className={cn("relative h-full w-full overflow-hidden", className)}
    >
      <motion.div
        aria-hidden="true"
        className="absolute inset-0"
        style={{ WebkitMaskImage: maskImage, maskImage }}
      >
        {children}
      </motion.div>
    </div>
  )
}