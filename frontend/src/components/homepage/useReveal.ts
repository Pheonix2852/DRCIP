import { useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(ScrollTrigger, useGSAP)

/**
 * One restrained fade + small translate reveal per section.
 * Children opt in with `data-reveal`. Reduced motion and GSAP failure leave
 * content fully visible (the reveal is progressive enhancement only).
 */
export function useReveal<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T>(null)

  useGSAP(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const targets = ref.current?.querySelectorAll('[data-reveal]')
    if (!targets || targets.length === 0) return
    gsap.from(targets, {
      opacity: 0,
      y: 24,
      duration: 0.7,
      ease: 'power2.out',
      stagger: 0.1,
      scrollTrigger: {
        trigger: ref.current,
        start: 'top 82%',
        once: true,
      },
    })
  }, { scope: ref })

  return ref
}