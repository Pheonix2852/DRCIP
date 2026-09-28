import { Link } from 'react-router-dom'
import { useReveal } from './useReveal'
import { primaryCtaClass } from './cta'
import convergenceSvg from '../../assets/homepage/spatial/drcip-convergence-paths.svg'

export function FinalCta() {
  const ref = useReveal<HTMLElement>()

  return (
    <section
      ref={ref}
      aria-labelledby="final-cta-heading"
      className="relative overflow-hidden border-t border-border bg-canvas py-24 md:py-32"
    >
      <img
        src={convergenceSvg}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.07]"
      />
      <div className="container-drcip relative">
        <div className="mx-auto max-w-3xl text-center" data-reveal>
          <p className="home-eyebrow">Begin Coordinating</p>
          <h2 id="final-cta-heading" className="home-h2 mt-5">
            Ready to coordinate?
          </h2>
          <p className="home-lede mx-auto">
            Sign in to access the DRCIP coordination platform.
          </p>
          <div className="mt-10">
            <Link to="/login" className={primaryCtaClass} data-testid="final-cta">
              Sign In
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}