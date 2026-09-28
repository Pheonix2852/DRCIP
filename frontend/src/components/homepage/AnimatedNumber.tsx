import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { prefersReducedMotion } from './homeMotion'

/**
 * GSAP number counter for demo KPIs. Reduced motion and initial renders show
 * the final value directly (the animation is progressive enhancement only).
 */
export function AnimatedNumber({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const current = useRef(value)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (prefersReducedMotion()) {
      el.textContent = String(value)
      current.current = value
      return
    }
    const state = { n: current.current }
    const tween = gsap.to(state, {
      n: value,
      duration: 0.6,
      ease: 'power2.out',
      onUpdate: () => {
        el.textContent = String(Math.round(state.n))
      },
    })
    return () => {
      tween.kill()
      current.current = Math.round(state.n)
    }
  }, [value])

  return <span ref={ref}>{value}</span>
}