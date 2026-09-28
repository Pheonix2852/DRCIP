import { useReveal } from './useReveal'
import { SectionHeading } from './SectionHeading'

const PRINCIPLES = [
  'AI recommendations are decision support, not autonomous dispatch',
  'Manual workflows continue when AI services are unavailable',
  'Every action creates an immutable audit record',
] as const

export function TrustSection() {
  const ref = useReveal<HTMLElement>()

  return (
    <section
      id="trust"
      ref={ref}
      aria-labelledby="trust-heading"
      className="scroll-mt-20 border-t border-border bg-canvas py-20 md:py-28"
    >
      <div className="container-drcip grid items-start gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-7">
          <SectionHeading
            eyebrow="Human Oversight"
            title="Intelligence supports. Humans decide."
            description="AI provides severity assessments, demand forecasts, and allocation recommendations — but never dispatches resources autonomously. The Disaster Coordinator reviews every recommendation and retains full authority to approve, modify, or manually assign. When intelligence services are unavailable, the platform continues operating through manual workflows. Every decision is recorded in an immutable audit trail."
            note="RAG access restricted to field officers, coordinators, and administrators — enforced server-side."
          />
        </div>

        <div className="lg:col-span-5">
          <ol data-reveal className="border-t border-border">
            {PRINCIPLES.map((point, i) => (
              <li key={point} className="border-b border-border py-6">
                <div className="flex items-start gap-4">
                  <span className="home-mono mt-1.5">{String(i + 1).padStart(2, '0')}</span>
                  <p className="text-[16px] font-medium leading-relaxed text-ink">{point}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}