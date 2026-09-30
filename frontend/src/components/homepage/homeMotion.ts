import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import type Lenis from 'lenis'

gsap.registerPlugin(useGSAP, ScrollTrigger)

let activeLenis: Lenis | null = null

export function setLenis(lenis: Lenis | null) {
  activeLenis = lenis
}

export function getLenis() {
  return activeLenis
}

export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function scrollToSection(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  if (activeLenis) {
    // Sections carry their own scroll-mt-* (also used by the native fallback
    // and any #hash navigation), so no extra offset — otherwise it double stacks.
    activeLenis.scrollTo(el, { offset: 0 })
  } else {
    el.scrollIntoView({ block: 'start' })
  }
}