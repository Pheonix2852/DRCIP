import { Boxes, Map, Radio, TrendingUp } from 'lucide-react'
import { useReveal } from './useReveal'
import { SectionHeading } from './SectionHeading'

const CAPABILITIES = [
  {
    title: 'Severity & demand intelligence',
    copy: 'Severity assessments and demand forecasts support triage — and manual workflows continue whenever intelligence services are unavailable.',
    Icon: TrendingUp,
  },
  {
    title: 'Resource & team coordination',
    copy: 'Teams, resources, and shelters tracked in one operational view. Optimization recommends an allocation — the coordinator decides.',
    Icon: Boxes,
  },
  {
    title: 'Field execution',
    copy: 'Assignments, status updates, and live tracking keep command centers and field teams moving to the same picture.',
    Icon: Radio,
  },
  {
    title: 'Spatial operations',
    copy: 'Geographic queries, proximity discovery, and severity overlays ground every decision in location.',
    Icon: Map,
  },
] as const

export function CapabilitiesSection() {
  const ref = useReveal<HTMLElement>()

  return (
    <section
      id="capabilities"
      ref={ref}
      aria-labelledby="capabilities-heading"
      className="scroll-mt-20 border-t border-border bg-surface py-20 md:py-28"
    >
      <div className="container-drcip">
        <SectionHeading
          eyebrow="Capabilities"
          title="Everything the response needs, in one system"
          description="Coordinated reporting, intelligence, resources, and field execution — packaged for every responder on the ground and in command."
        />

        <ul className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {CAPABILITIES.map(({ title, copy, Icon }) => (
            <li
              key={title}
              data-reveal
              className="glass-surface flex items-start gap-4 rounded-drcip-lg p-6 transition-colors"
            >
              <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-drcip-md border border-border bg-surface">
                <Icon className="h-5 w-5 text-cobalt-deep" aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-lg font-medium tracking-tight text-ink">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">{copy}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}