import { useEffect, useMemo, useRef, useState } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import gridSvg from '../assets/homepage/spatial/drcip-grid.svg'
import mapOutlineSvg from '../assets/homepage/spatial/drcip-map-outline.svg'
import convergenceSvg from '../assets/homepage/spatial/drcip-convergence-paths.svg'

gsap.registerPlugin(useGSAP)

const SEEN_KEY = 'drcip-loader-seen'

const COLS = 9
const ROWS = 5
const GRID_X = 40
const GRID_Y = 60
const STEP = 70

interface Dot {
  cx: number
  cy: number
  sx: number
  sy: number
}

/** Deterministic scatter (fixed LCG) so the frame is stable per session. */
function makeDots(): Dot[] {
  let seed = 20260928
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
  const dots: Dot[] = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      dots.push({
        cx: GRID_X + c * STEP,
        cy: GRID_Y + r * STEP,
        sx: GRID_X + c * STEP + (rand() * 140 - 70),
        sy: GRID_Y + r * STEP + (rand() * 140 - 70),
      })
    }
  }
  return dots
}

interface DrcipLoaderProps {
  onDone: () => void
}

/**
 * Signature first-load sequence (DESIGN_SYSTEM §15): scattered points →
 * Cartesian grid → simplified geography → incident/resource layers →
 * stabilize → hand off to the hero. First session only; repeat visits and
 * reduced-motion show the settled state immediately. Never blocks the CTA:
 * a timeout forces completion even if animation fails.
 */
export function DrcipLoader({ onDone }: DrcipLoaderProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const [finished, setFinished] = useState(() => sessionStorage.getItem(SEEN_KEY) === '1')
  const dots = useMemo(makeDots, [])

  useGSAP(() => {
    if (finished) return
    if (!overlayRef.current) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const finish = () => {
      sessionStorage.setItem(SEEN_KEY, '1')
      setFinished(true)
      onDone()
    }

    if (reduced) {
      // Settled state immediately, quick fade, no structural motion.
      const ctx = gsap.context(() => {}, overlayRef)
      gsap.set(overlayRef.current, { autoAlpha: 1 })
      gsap.fromTo(
        '.lp-map, .lp-grid, .lp-layer-dot',
        { opacity: 0 },
        { opacity: 0.45, duration: 0.01, stagger: 0.01 },
      )
      gsap.to(overlayRef.current, { autoAlpha: 0, duration: 0.25, delay: 0.4, onComplete: finish })
      return () => ctx.revert()
    }

    const tl = gsap.timeline({ defaults: { ease: 'power2.inOut' } })

    tl.to('.lp-grid', { opacity: 0.5, duration: 0.7 }, 0.1)
      // Fragmented points → rapid Cartesian organization.
      .fromTo(
        '.lp-dot',
        { x: (i: number) => dots[i].sx - dots[i].cx, y: (i: number) => dots[i].sy - dots[i].cy, opacity: 0, scale: 0.7 },
        { x: 0, y: 0, opacity: 0.95, scale: 1, duration: 0.55, ease: 'power2.in', stagger: { each: 0.012, from: 'edges' } },
        0.15,
      )
      // Controlled settling.
      .to('.lp-dot', { opacity: 1, duration: 0.2 }, '-=0.1')
      .to({}, { duration: 0.35, ease: 'none' })
      // Grid transforms into simplified geographic boundaries.
      .to('.lp-map', { opacity: 0.5, scale: 1.03, duration: 0.7, ease: 'power2.out' }, '+=0.1')
      .to('.lp-grid', { opacity: 0.12, duration: 0.6 }, '<')
      // Light incident / resource layers cascade onto the spatial field.
      .fromTo(
        '.lp-layer-dot',
        { opacity: 0, scale: 0.4 },
        { opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(1.8)', stagger: { each: 0.06 } },
        '+=0.15',
      )
      .to('.lp-convergence', { opacity: 0.45, duration: 0.5, ease: 'power1.out' }, '<')
      // Stabilize, then hand over to the hero.
      .to({}, { duration: 0.45, ease: 'none' })
      .to(overlayRef.current, { autoAlpha: 0, duration: 0.5, onComplete: finish })
  }, { scope: overlayRef, dependencies: [finished, dots, onDone] })

  // Hard fallback: never let the loader strand the hero/CTA. If GSAP fails to
  // run or never completes, force completion so content is always reachable.
  useEffect(() => {
    if (finished) return
    const t = setTimeout(() => {
      sessionStorage.setItem(SEEN_KEY, '1')
      setFinished(true)
      onDone()
    }, 4500)
    return () => clearTimeout(t)
  }, [finished, onDone])

  if (finished) return null

  return (
    <div
      ref={overlayRef}
      role="progressbar"
      aria-label="Preparing the coordination view"
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-hidden bg-[var(--home-canvas)]"
    >
      <div className="relative aspect-[16/10] w-[min(640px,88vw)]">
        <img src={gridSvg} alt="" aria-hidden="true" className="lp-grid absolute inset-0 h-full w-full object-cover opacity-0" />
        <svg viewBox="0 0 640 400" className="relative h-full w-full" aria-hidden="true">
          {dots.map((d, i) => (
            <rect
              key={i}
              className="lp-dot"
              data-testid="loader-dot"
              x={d.cx - 3}
              y={d.cy - 3}
              width="6"
              height="6"
              fill="#1649B8"
            />
          ))}
          {[
            { cx: 300, cy: 210 },
            { cx: 468, cy: 122 },
            { cx: 542, cy: 330 },
            { cx: 216, cy: 314 },
            { cx: 410, cy: 272 },
            { cx: 560, cy: 216 },
            { cx: 250, cy: 148 },
          ].map((p, i) => (
            <circle key={i} className="lp-layer-dot" cx={p.cx} cy={p.cy} r="7" fill="#2F68F0" opacity="0" />
          ))}
        </svg>
        <img
          src={mapOutlineSvg}
          alt=""
          aria-hidden="true"
          className="lp-map absolute inset-0 h-full w-full object-contain opacity-0"
        />
        <img
          src={convergenceSvg}
          alt=""
          aria-hidden="true"
          className="lp-convergence absolute inset-0 h-full w-full object-contain opacity-0"
        />
      </div>
    </div>
  )
}