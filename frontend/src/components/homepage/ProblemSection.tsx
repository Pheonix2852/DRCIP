import { useReveal } from './useReveal'
import { SectionHeading } from './SectionHeading'
import fieldCoordination from '../../assets/homepage/supporting/drcip-field-coordination.webp'

const POINTS = [
  'Incidents reported from the field, organized geographically in real time',
  'Resources, teams, and shelters tracked in one operational view',
  'Every decision recorded and auditable',
] as const

export function ProblemSection() {
  const ref = useReveal<HTMLElement>()

  return (
    <section
      id="product"
      ref={ref}
      aria-labelledby="problem-heading"
      className="relative scroll-mt-20 border-t border-border bg-canvas py-20 md:py-28"
    >
      <div className="container-drcip">
        <div className="grid items-start gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-7">
            <SectionHeading
              eyebrow="The Challenge"
              title="Disaster response is fragmented. DRCIP organizes the chaos."
              description="During a disaster, critical information is scattered across incident reports, field personnel, resource inventories, and coordination channels. Responders need a single system that connects reporting, operational data, intelligence, and execution — with human judgment at every decision point."
            />
          </div>

          <div className="lg:col-span-5" data-reveal>
            <figure className="home-figure">
              <img
                src={fieldCoordination}
                alt="Field responders coordinating an operation on the ground"
                loading="lazy"
                decoding="async"
                className="aspect-[4/3] w-full object-cover"
              />
              <figcaption className="home-figure-cap">
                <span className="home-mono">FIELD OPS · SASANGIR CROSSING</span>
                <span className="home-mono">09:41</span>
              </figcaption>
            </figure>
          </div>
        </div>

        <ol data-reveal className="mt-16 grid grid-cols-1 gap-0 md:grid-cols-3 md:gap-8">
          {POINTS.map((point, i) => (
            <li
              key={point}
              className="border-t border-border pt-6 md:border-l md:border-t-0 md:px-6 md:first:border-l-0 md:first:pl-0"
            >
              <span className="home-mono">0{i + 1}</span>
              <p className="mt-3 max-w-xs text-[15px] leading-relaxed text-ink">{point}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}