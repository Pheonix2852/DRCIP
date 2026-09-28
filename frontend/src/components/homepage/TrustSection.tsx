import { useReveal } from './useReveal'
import { SectionHeading } from './SectionHeading'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../../pages/ui/accordion'

const PRINCIPLES = [
  {
    id: 'ai-recommends',
    title: 'AI recommendations are decision support, not autonomous dispatch',
    copy: 'AI provides severity assessments, demand forecasts, and allocation recommendations — but never dispatches resources autonomously. The Disaster Coordinator reviews every recommendation and retains full authority to approve, modify, or manually assign.',
  },
  {
    id: 'offline-first-workflows',
    title: 'Manual workflows continue when AI services are unavailable',
    copy: 'When intelligence services are unavailable, the platform continues operating through manual workflows. The coordinator can manually assess and dispatch using standard workflows.',
  },
  {
    id: 'immutable-audit',
    title: 'Every action creates an immutable audit record',
    copy: 'Every decision is recorded in an immutable audit trail. The original AI recommendation and the final human decision are stored separately, so each operational action can be examined after the fact.',
  },
] as const

/**
 * Trust section — editorial disclosures in a collapsible accordion.
 * Strict grid alignment: [fixed index] [flexible title] [fixed chevron].
 * All closed initially; single collapsible; content-driven height.
 */
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
          />
        </div>

        <div className="lg:col-span-5" data-reveal>
          <Accordion type="single" collapsible className="border-t border-border">
            {PRINCIPLES.map((item, i) => (
              <AccordionItem key={item.id} value={item.id} className="glass-accordion border-b border-border">
                <AccordionTrigger className="group gap-0 py-4 text-left hover:no-underline">
                  <span className="grid w-full grid-cols-[2.5rem_1fr] items-center gap-x-3">
                    <span className="home-mono text-text-muted group-data-[state=open]:text-cobalt-deep">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="text-[16px] font-medium leading-snug text-ink group-data-[state=open]:text-cobalt-deep">
                      {item.title}
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-5">
                  <p className="text-sm leading-relaxed text-text-secondary">{item.copy}</p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  )
}