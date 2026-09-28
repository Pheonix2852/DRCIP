import { useEffect } from 'react'
import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { prefersReducedMotion, setLenis } from './homeMotion'

/**
 * Lenis smooth scroll for the public homepage (tablet/desktop only).
 * Mobile keeps native scroll; reduced motion keeps native scroll.
 * Single RAF: Lenis drives through the GSAP ticker so ScrollTrigger stays
 * perfectly in sync.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (prefersReducedMotion()) return
    if (!window.matchMedia('(min-width: 641px)').matches) return

    const lenis = new Lenis({ lerp: 0.085 })
    setLenis(lenis)
    lenis.on('scroll', ScrollTrigger.update)

    const raf = (time: number) => lenis.raf(time * 1000)
    gsap.ticker.add(raf)
    gsap.ticker.lagSmoothing(0)

    return () => {
      gsap.ticker.remove(raf)
      lenis.destroy()
      setLenis(null)
    }
  }, [])

  return null
}