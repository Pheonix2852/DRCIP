import { InfiniteMovingCards, type MovingCardItem } from '../ui/infinite-moving-cards'
import { useReveal } from './useReveal'
import { SectionHeading } from './SectionHeading'

/**
 * Illustrative field perspectives — fictional quotes composed for the
 * homepage presentation. Not sourced from real users or systems.
 */
const PERSPECTIVES: MovingCardItem[] = [
  {
    quote:
      'One screen for every team, every resource, every decision — the coordination the field has always needed.',
    name: 'Disaster Coordinator',
    title: 'Aranya District',
  },
  {
    quote:
      'We posted our status from the site and command saw it instantly. No phone trees, no guesswork.',
    name: 'Field Officer',
    title: 'Team Kaddua',
  },
  {
    quote:
      'Reporting took minutes. Following it all the way to resolution gave our community certainty.',
    name: 'Citizen',
    title: 'Riverside Ward',
  },
  {
    quote:
      'Every action is traceable. When oversight matters most, that visibility decides how a response is run.',
    name: 'Administrator',
    title: 'Regional Command',
  },
] as const

export function PerspectivesSection() {
  const ref = useReveal<HTMLElement>()

  return (
    <section
      ref={ref}
      aria-labelledby="perspectives-heading"
      className="overflow-hidden border-t border-border bg-canvas py-20 md:py-28"
    >
      <div className="container-drcip">
        <SectionHeading
          eyebrow="Field Perspectives"
          title="Built for the people who respond"
          description="From the command center to the last mile — DRCIP keeps every role on the same operational picture. Illustrative perspectives for demonstration."
          align="center"
        />
      </div>

      <div data-reveal className="mt-14">
        <InfiniteMovingCards items={[...PERSPECTIVES]} direction="left" speed="slow" pauseOnHover />
      </div>
    </section>
  )
}