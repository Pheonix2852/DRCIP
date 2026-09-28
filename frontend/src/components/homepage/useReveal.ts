import { useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import { prefersReducedMotion } from './homeMotion'

gsap.registerPlugin(ScrollTrigger, useGSAP)

export type RevealMode = 'rise' | 'float' | 'pop'

/** Per-section motion signatures — not every section fades up the same way. */
const MODES: Record<RevealMode, { y?: number; scale?: number; rotate?: number; opacity: number }> = {
  rise: { y: 24, opacity: 0 },
  float: { y: 40, scale: 0.983, rotate: 0.4, opacity: 0 },
  pop: { y: 14, scale: 0.82, opacity: 0 },
}

/**
 * One restrained reveal per section. Elements opt in with `data-reveal` and
 * may set `data-reveal="float"` / `data-reveal="pop"` to override the section
 * default. Reduced motion and GSAP failure leave content fully visible (the
 * reveal is progressive enhancement only).
 */
export function useReveal<T extends HTMLElement = HTMLElement>(mode: RevealMode = 'rise') {
  const ref = useRef<T>(null)

  useGSAP(() => {
    if (prefersReducedMotion()) return
    const targets = ref.current?.querySelectorAll<HTMLElement>('[data-reveal]')
    if (!targets || targets.length === 0) return
    targets.forEach((el, i) => {
      const dataMode = el.dataset.reveal
      const resolved = dataMode && dataMode in MODES ? (dataMode as RevealMode) : mode
      gsap.from(el, {
        ...MODES[resolved],
        duration: 0.8,
        ease: 'power3.out',
        delay: i * 0.08,
        scrollTrigger: {
          trigger: el,
          start: 'top 87%',
          once: true,
        },
      })
    })
  }, { scope: ref })

  return ref
}