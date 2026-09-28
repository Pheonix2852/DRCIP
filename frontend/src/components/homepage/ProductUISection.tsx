import { useReveal } from './useReveal'
import { SectionHeading } from './SectionHeading'
import { DemoCommandCenter } from './DemoCommandCenter'
import { DemoFieldOperations } from './DemoFieldOperations'
import { DemoReports } from './DemoReports'

export function ProductUISection() {
  const ref = useReveal<HTMLElement>('float')

  return (
    <section
      ref={ref}
      aria-labelledby="platform-heading"
      className="border-t border-border bg-canvas py-20 md:py-28"
    >
      <div className="container-drcip">
        <SectionHeading
          eyebrow="The Platform"
          title="Built for operational clarity"
          description="Three surfaces, one operational record — incident intelligence at the command center, execution in the field, and analytics in the reports."
          note="Illustrative operational view — fabricated sample data for demonstration. Live surfaces render from the DRCIP API."
        />

        <div className="mt-12 space-y-8" data-reveal>
          <DemoCommandCenter />
          <div className="grid grid-cols-1 gap-8 xl:grid-cols-2">
            <DemoFieldOperations />
            <DemoReports />
          </div>
        </div>
      </div>
    </section>
  )
}