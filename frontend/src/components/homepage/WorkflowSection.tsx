import { useReveal } from './useReveal'
import { SectionHeading } from './SectionHeading'
import resourceCoordination from '../../assets/homepage/supporting/drcip-resource-coordination.webp'

const STEPS = [
  {
    n: '01',
    title: 'Report an incident',
    copy: 'Citizens and field officers submit incident reports with location, photos, and video — creating the first operational record.',
  },
  {
    n: '02',
    title: 'Assess and prioritize',
    copy: "Severity analysis and demand forecasting support the coordinator's triage decision. When intelligence is unavailable, manual triage continues without interruption.",
  },
  {
    n: '03',
    title: 'Coordinate resources',
    copy: 'The command center provides a live view of incidents, resources, teams, and shelters. Optimization recommends the best allocation — the coordinator decides.',
  },
  {
    n: '04',
    title: 'Execute the response',
    copy: 'Field teams receive assignments, submit status updates, and complete operations — with real-time visibility across the command center.',
  },
] as const

export function WorkflowSection() {
  const ref = useReveal<HTMLElement>()

  return (
    <section
      id="workflow"
      ref={ref}
      aria-labelledby="workflow-heading"
      className="scroll-mt-20 border-t border-border bg-surface-cool py-20 md:py-28"
    >
      <div className="container-drcip">
        <SectionHeading
          eyebrow="How It Works"
          title="From report to resolution"
          description="One engineered process, four accountable steps. Each hand-off is recorded in the operational record."
        />

        <ol data-reveal className="mt-16 grid grid-cols-1 gap-10 md:grid-cols-4 md:gap-0 md:divide-x md:divide-[var(--border)]">
          {STEPS.map((step) => (
            <li key={step.n} className="border-t border-border pt-6 md:border-t-0 md:px-8 md:first:pl-0 md:last:pr-0">
              <span className="home-mono">STEP {step.n}</span>
              <h3 className="mt-3 text-xl font-medium tracking-tight text-ink">{step.title}</h3>
              <p className="mt-2 max-w-xs text-sm leading-relaxed text-text-secondary">{step.copy}</p>
            </li>
          ))}
        </ol>

        <figure data-reveal className="mt-16 home-figure">
          <img
            src={resourceCoordination}
            alt="Coordinated allocation of resources and response assets across a region"
            loading="lazy"
            decoding="async"
            className="aspect-[21/9] w-full object-cover"
          />
          <figcaption className="home-figure-cap">
            <span className="home-mono">ALLOCATION BOARD · COORDINATOR REVIEW</span>
            <span className="home-mono">DRCIP / WORKFLOW-04</span>
          </figcaption>
        </figure>
      </div>
    </section>
  )
}