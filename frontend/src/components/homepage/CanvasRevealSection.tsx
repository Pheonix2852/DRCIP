import { Suspense, lazy, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CtaArrow } from './cta'
import { buttonVariants } from '../ui/button'
import { cn } from '../../lib/utils'
import aerial from '../../assets/homepage/coordinated-response-aerial.webp'

/**
 * Lazy WebGL overlay so `three`/`@react-three/fiber` is only fetched when the
 * browser can actually use it (no reduced motion + WebGL available). Without
 * those, the final reveal degrades to the static aerial plate.
 */
const CanvasRevealEffect = lazy(() =>
  import('../ui/canvas-reveal-effect').then((m) => ({ default: m.CanvasRevealEffect })),
)

function useCanAnimate() {
  const [ok, setOk] = useState(false)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    try {
      const probe = document.createElement('canvas')
      setOk(Boolean(probe.getContext('webgl2') || probe.getContext('webgl')))
    } catch {
      setOk(false)
    }
  }, [])
  return ok
}

export function CanvasRevealSection() {
  const canAnimate = useCanAnimate()

  return (
    <section
      aria-labelledby="canvas-reveal-heading"
      className="relative overflow-hidden border-t border-border py-24 md:py-36"
    >
      <img
        src={aerial}
        alt=""
        aria-hidden="true"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
      />

      {canAnimate && (
        <Suspense fallback={null}>
          <div className="absolute inset-0" aria-hidden="true">
            <CanvasRevealEffect containerClassName="h-full w-full" />
          </div>
        </Suspense>
      )}

      {/* Homepage gradient overlay — one of the four documented exceptions. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink via-ink/55 to-ink/15"
      />

      <div className="container-drcip relative z-10">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-white/70">
            Operational Clarity
          </p>
          <h2
            id="canvas-reveal-heading"
            className="mt-5 text-balance text-3xl font-semibold tracking-tight text-white md:text-5xl"
          >
            Built for decisions that cannot wait.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-white/80 md:text-lg">
            Every recommendation surfaces for human review. Every assignment is
            recorded. When the response is live, the platform stays out of the way.
          </p>
          <Link
            to="/login"
            className={cn(
              buttonVariants({ variant: 'capsule' }),
              'mt-10 min-h-12 px-7 py-3 text-base',
            )}
            data-testid="canvas-reveal-cta"
          >
            Enter the Platform <CtaArrow />
          </Link>
          <p className="home-mono mt-12 text-white/50">
            DRCIP · COORDINATED RESPONSE · 2026
          </p>
        </div>
      </div>
    </section>
  )
}