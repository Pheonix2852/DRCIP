import { useRef } from 'react'
import { Link } from 'react-router-dom'
import gsap from 'gsap'
import { SplitText } from 'gsap/SplitText'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import { primaryCtaClass, secondaryCtaClass, CtaArrow } from './cta'
import { DrcipHeroPanel } from './DrcipHeroPanel'
import { SpatialField } from './SpatialField'
import { REGION } from './demo-data'
import { prefersReducedMotion, scrollToSection } from './homeMotion'
import { bindPointer } from './pointerSync'
import heroResponse from '../../assets/homepage/hero/drcip-hero-response.webp'

gsap.registerPlugin(useGSAP, SplitText, ScrollTrigger)

const HEADLINE_LINES = ['Coordinate faster.', 'Respond smarter.', 'Save critical time.']
const SEEN_KEY = 'drcip-hero-seen'

/**
 * Full-viewport art-directed hero.
 *
 * Phases:
 *   A – Preparation (fonts ready, SplitText)
 *   B – Line mask reveal (yPercent rise)
 *   C – Word micro-stagger (opacity + tiny y)
 *   D – Kinetic settle (final resting state = normal premium typography)
 *   E – Pointer response (quickTo x/y, per-line depth factors)
 *   F – Pointer exit (smoothly returns to zero)
 *   G – Scroll response (plate parallax, fore fade)
 */
export function HeroSection({ start }: { start: boolean }) {
  const sectionRef = useRef<HTMLElement>(null)
  const heavy = useRef(!sessionStorage.getItem(SEEN_KEY)).current

  /* ── Phase A–D: hero entrance (fonts-ready gated, SplitText) ── */
  useGSAP((_, contextSafe) => {
    if (!start || !contextSafe) return
    if (prefersReducedMotion()) {
      sessionStorage.setItem(SEEN_KEY, '1')
      return
    }

    if (!heavy) {
      gsap.from('.hero-fore > *', {
        y: 12,
        duration: 0.45,
        ease: 'power1.out',
        stagger: 0.06,
      })
      return
    }

    sessionStorage.setItem(SEEN_KEY, '1')

    const buildEntrance = contextSafe(() => {
      /* Pre-state: everything hidden / displaced */
      gsap.set('.hm-line', { yPercent: 118 })
      gsap.set('.hero-eyebrow', { yPercent: 40, opacity: 0 })
      gsap.set('.hero-trace', { opacity: 0 })
      gsap.set('.hero-sub', { yPercent: 16, opacity: 0 })
      gsap.set('.hero-panel', { yPercent: 14, opacity: 0, scale: 0.985 })
      gsap.set('.hero-cta > *', { yPercent: 22, opacity: 0 })
      gsap.set('.hero-meta > *', { opacity: 0 })
      gsap.set('.hp-track i', { scaleX: 0 })
      gsap.set('.hp-dot', { scale: 0 })
      gsap.set('img.hero-plate', { scale: 1.04 })

      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })

      /* Phase B — line mask reveal: rise from behind overflow:hidden mask */
      tl.to('.hero-eyebrow', { yPercent: 0, opacity: 1, duration: 0.5, ease: 'power2.out' }, 0.02)
        .to('.hm-line', { yPercent: 0, duration: 0.95, ease: 'expo.out', stagger: 0.09 }, '-=0.28')

      /* Split words after lines settle */
      const split = new SplitText('.hero-h1', { type: 'words' })

      /* Phase C — word micro-stagger */
      tl.from(split.words, {
        y: 5,
        opacity: 0,
        duration: 0.5,
        ease: 'power2.out',
        stagger: 0.018,
      }, '-=0.35')

      /* Remaining entrance elements */
      tl.to('.hero-trace', { opacity: 0.5, duration: 0.9, ease: 'power1.out' }, '-=0.5')
        .to('.hero-sub', { yPercent: 0, opacity: 1, duration: 0.6, ease: 'power2.out' }, '-=0.6')
        .to('.hero-panel', { yPercent: 0, opacity: 1, scale: 1, duration: 0.75, ease: 'power3.out' }, '-=0.55')
        .to('.hero-cta > *', { yPercent: 0, opacity: 1, duration: 0.5, ease: 'power2.out', stagger: 0.08 }, '-=0.5')
        .to('.hero-meta > *', { opacity: 1, duration: 0.4, ease: 'power2.out', stagger: 0.08 }, '-=0.32')
        .to('.hp-track i', { scaleX: 1, duration: 0.7, ease: 'power2.inOut' }, '-=0.5')
        .to('.hp-dot', { scale: 1, duration: 0.35, ease: 'power2.out' }, '<')

      /* Plate cinematic scale settle (runs parallel from t=0) */
      tl.to('img.hero-plate', { scale: 1, duration: 1.2, ease: 'power2.out' }, 0)
    })

    document.fonts.ready.then(() => {
      buildEntrance()
      requestAnimationFrame(() => ScrollTrigger.refresh())
    })
  }, { scope: sectionRef, dependencies: [start, heavy] })

  /* ── Phase E/F: pointer-coupled depth drift ── */
  useGSAP(() => {
    if (!start || prefersReducedMotion()) return
    if (!sectionRef.current) return

    const lineFactors = [
      { x: 3.5, y: 1 },
      { x: 5.5, y: 1.5 },
      { x: 8, y: 2 },
    ]

    const lineEls = gsap.utils.toArray<HTMLElement>('.hm-line', sectionRef.current)
    const quickFns = lineEls.map((el, i) => ({
      x: gsap.quickTo(el, 'x', { duration: 1, ease: 'power3.out' }),
      y: gsap.quickTo(el, 'y', { duration: 1.2, ease: 'power3.out' }),
      f: lineFactors[i] ?? lineFactors[lineFactors.length - 1],
    }))

    const panel = sectionRef.current.querySelector('.hero-panel')
    const plate = sectionRef.current.querySelector('img.hero-plate')
    const panelX = panel ? gsap.quickTo(panel, 'x', { duration: 1.4, ease: 'power3.out' }) : null
    const panelY = panel ? gsap.quickTo(panel, 'y', { duration: 1.4, ease: 'power3.out' }) : null
    const plateX = plate ? gsap.quickTo(plate, 'x', { duration: 1.6, ease: 'power3.out' }) : null
    const plateY = plate ? gsap.quickTo(plate, 'y', { duration: 1.6, ease: 'power3.out' }) : null

    return bindPointer(sectionRef.current, (s) => {
      if (!s.active) {
        quickFns.forEach((f) => { f.x(0); f.y(0) })
        panelX?.(0); panelY?.(0)
        plateX?.(0); plateY?.(0)
      } else {
        quickFns.forEach((f) => {
          f.x(s.x * f.f.x)
          f.y(s.y * f.f.y)
        })
        panelX?.(-s.x * 5)
        panelY?.(s.y * 3)
        plateX?.(-s.x * 2)
        plateY?.(s.y * 1.5)
      }
    })
  }, { scope: sectionRef, dependencies: [start] })

  /* ── Phase G: scroll response (plate parallax + fore fade) ── */
  useGSAP(() => {
    const mm = gsap.matchMedia()
    mm.add('(min-width: 641px) and (prefers-reduced-motion: no-preference)', () => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top top',
          end: 'bottom top',
          scrub: 0.5,
        },
      })
      tl.fromTo('.hero-plate', { yPercent: 0, scale: 1 }, { yPercent: 8, scale: 1.07, ease: 'none' }, 0)
        .to('.hero-fore', { opacity: 0, yPercent: -6, ease: 'none' }, 0)
    })
  }, { scope: sectionRef })

  return (
    <section
      ref={sectionRef}
      aria-label="DRCIP introduction"
      data-hero-stage
      className="drcip-hero -mt-20"
    >
      <img
        src={heroResponse}
        alt=""
        aria-hidden="true"
        decoding="async"
        className="hero-plate"
      />
      <SpatialField active={start} />
      <div className="hero-scrim" aria-hidden="true" />

      <div className="hero-fore">
        <div className="hero-main">
          <div className="hero-copy">
            <p className="hero-eyebrow">Spatial intelligence for disaster response</p>
            <h1 className="hero-h1" aria-label="Coordinate faster. Respond smarter. Save critical time.">
              {HEADLINE_LINES.map((line) => (
                <span key={line} className="hm-mask">
                  <span>{line}</span>
                </span>
              ))}
            </h1>
            <p className="hero-sub">
              DRCIP connects incident reporting, field teams, resources, and operational
              intelligence into a single coordination platform.
            </p>
            <div className="hero-cta">
              <Link to="/login" className={primaryCtaClass} data-testid="hero-primary-cta">
                Get Started <CtaArrow />
              </Link>
              <button
                type="button"
                onClick={() => scrollToSection('workflow')}
                className={secondaryCtaClass}
                data-testid="hero-secondary-cta"
              >
                See How It Works <CtaArrow />
              </button>
            </div>
          </div>

          <div className="hero-panel">
            <DrcipHeroPanel />
          </div>
        </div>

        <div className="hero-meta">
          <span className="home-mono">
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <circle cx="6" cy="6" r="4.2" stroke="#1649B8" strokeWidth="1.2" />
              <path d="M6 1v2M6 9v2M1 6h2M9 6h2" stroke="#1649B8" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            {REGION.coordNum}
          </span>
          <span className="home-mono">FIELD OPS · {REGION.label.toUpperCase()} · 09:41</span>
        </div>
      </div>
    </section>
  )
}
