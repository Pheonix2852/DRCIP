import { useRef } from 'react'
import { Link } from 'react-router-dom'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { primaryCtaClass, secondaryCtaClass } from './cta'
import { DrcipHeroPanel } from './DrcipHeroPanel'
import { REGION } from './demo-data'
import heroResponse from '../../assets/homepage/hero/drcip-hero-response.webp'
import convergenceSvg from '../../assets/homepage/spatial/drcip-convergence-paths.svg'

gsap.registerPlugin(useGSAP)

const HEADLINE_LINES = ['Coordinate faster.', 'Respond smarter.', 'Save critical time.']
const SEEN_KEY = 'drcip-hero-seen'

function scrollToWorkflow() {
  document.getElementById('workflow')?.scrollIntoView({ block: 'start' })
}

/**
 * Full-viewport art-directed hero (ConSentinel design-unit system).
 * First-session: masked-line + settle entrance choreography played after
 * the DrcipLoader finishes. Repeat visits: a quick, light reveal.
 * Reduced motion renders the settled frame with no animation.
 */
export function HeroSection({ start }: { start: boolean }) {
  const sectionRef = useRef<HTMLElement>(null)
  const heavy = useRef(!sessionStorage.getItem(SEEN_KEY)).current

  useGSAP(() => {
    if (!start) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      sessionStorage.setItem(SEEN_KEY, '1')
      return
    }

    if (heavy) {
      sessionStorage.setItem(SEEN_KEY, '1')
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
      tl.from('.hero-eyebrow', { yPercent: 40, opacity: 0, duration: 0.5, ease: 'power2.out' }, 0.02)
        .from(
          '.hm-line',
          { yPercent: 118, duration: 0.95, ease: 'expo.out', stagger: 0.09 },
          '-=0.28',
        )
        .from('.hero-sub', { yPercent: 16, opacity: 0, duration: 0.6, ease: 'power2.out' }, '-=0.55')
        .from('.hero-panel', { yPercent: 14, opacity: 0, scale: 0.985, duration: 0.75, ease: 'power3.out' }, '-=0.6')
        .from(
          '.hero-cta > *',
          { yPercent: 22, opacity: 0, duration: 0.5, ease: 'power2.out', stagger: 0.08 },
          '-=0.55',
        )
        .from('.hero-meta > *', { opacity: 0, duration: 0.4, ease: 'power2.out', stagger: 0.08 }, '-=0.32')
        .fromTo(
          '.hp-track i',
          { scaleX: 0 },
          { scaleX: 1, duration: 0.7, ease: 'power2.inOut' },
          '-=0.5',
        )
        .fromTo('.hp-dot', { scale: 0 }, { scale: 1, duration: 0.35, ease: 'power2.out' }, '<')
      return () => {
        tl.kill()
      }
    }

    gsap.from('.hero-fore > *', {
      opacity: 0,
      y: 12,
      duration: 0.45,
      ease: 'power1.out',
      stagger: 0.06,
    })
  }, { scope: sectionRef, dependencies: [start, heavy], revertOnUpdate: false })

  return (
    <section
      ref={sectionRef}
      aria-label="DRCIP introduction"
      data-hero-stage
      className="drcip-hero -mt-16"
    >
      <img
        src={heroResponse}
        alt=""
        aria-hidden="true"
        fetchPriority="high"
        decoding="async"
        className="hero-plate"
      />
      <div className="hero-scrim" aria-hidden="true" />
      <img
        src={convergenceSvg}
        alt=""
        aria-hidden="true"
        loading="eager"
        className="hero-trace"
      />

      <div className="hero-fore">
        <div className="hero-main">
          <div className="hero-copy">
            <p className="hero-eyebrow">Spatial intelligence for disaster response</p>
            <h1 className="hero-h1">
              {HEADLINE_LINES.map((line) => (
                <span key={line} className="hm-mask">
                  <span className="hm-line">{line}</span>
                </span>
              ))}
            </h1>
            <p className="hero-sub">
              DRCIP connects incident reporting, field teams, resources, and operational
              intelligence into a single coordination platform.
            </p>
            <div className="hero-cta">
              <Link to="/login" className={primaryCtaClass} data-testid="hero-primary-cta">
                Get Started
              </Link>
              <button
                type="button"
                onClick={scrollToWorkflow}
                className={secondaryCtaClass}
                data-testid="hero-secondary-cta"
              >
                See How It Works →
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