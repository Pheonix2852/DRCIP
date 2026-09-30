import { MaskContainer } from '../ui/svg-mask-effect'
import { useReveal } from './useReveal'
import { SectionHeading } from './SectionHeading'
import responseEnvironment from '../../assets/homepage/response-environment.webp'

export function SvgMaskSection() {
  const ref = useReveal<HTMLElement>()

  return (
    <section
      ref={ref}
      aria-labelledby="svg-mask-heading"
      className="border-t border-border bg-surface-cool py-20 md:py-28"
    >
      <div className="container-drcip grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-5">
          <SectionHeading
            eyebrow="One Response Environment"
            title="The full picture, revealed in context"
            description="Incidents, teams, and resources are never isolated. DRCIP keeps every element in a shared operational environment — move across the frame and the response comes into focus."
          />
          <p className="home-mono mt-8">MOVE CURSOR TO REVEAL · RESPONSE ENVIRONMENT</p>
        </div>

        <div data-reveal className="lg:col-span-7">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-drcip-lg border border-border shadow-drcip-md">
            <img
              src={responseEnvironment}
              alt="Aerial response environment during coordinated operations"
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <MaskContainer radius={280} className="absolute inset-0">
              <img
                src={responseEnvironment}
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            </MaskContainer>
          </div>
        </div>
      </div>
    </section>
  )
}