import { useReveal } from './useReveal'
import { SectionHeading } from './SectionHeading'
import { WorldMap, type WorldLocation } from '../ui/world-map'

const NODES: WorldLocation[] = [
  { lat: 23.0225, lng: 72.5714, label: 'Aranya District' },
  { lat: 28.6139, lng: 77.209, label: 'New Delhi' },
  { lat: 19.076, lng: 72.8777, label: 'Mumbai' },
  { lat: 22.5726, lng: 88.3639, label: 'Kolkata' },
  { lat: 13.0827, lng: 80.2707, label: 'Chennai' },
  { lat: 23.8103, lng: 90.4125, label: 'Dhaka' },
  { lat: 27.7172, lng: 85.324, label: 'Kathmandu' },
  { lat: 6.9271, lng: 79.8612, label: 'Colombo' },
  { lat: 13.7563, lng: 100.5018, label: 'Bangkok' },
  { lat: 1.3521, lng: 103.8198, label: 'Singapore' },
  { lat: 25.2048, lng: 55.2708, label: 'Dubai' },
  { lat: -1.2921, lng: 36.8219, label: 'Nairobi' },
  { lat: 51.5074, lng: -0.1278, label: 'London' },
  { lat: 40.7128, lng: -74.006, label: 'New York' },
  { lat: 34.0522, lng: -118.2437, label: 'Los Angeles' },
] as const

export function WorldMapSection() {
  const ref = useReveal<HTMLElement>()

  return (
    <section
      ref={ref}
      aria-labelledby="world-map-heading"
      className="border-t border-border bg-canvas py-20 md:py-28"
    >
      <div className="container-drcip">
        <SectionHeading
          eyebrow="World Map"
          title="A coordination network that scales beyond any single district"
          description="The same operational model that runs one district is built to federate across regions. Shown here as a conceptual network — deployed nodes, shared response grids."
          note="Conceptual illustration, not live telemetry."
        />

        <div data-reveal className="mt-12">
          <WorldMap
            locations={[...NODES]}
            className="aspect-[2/1] w-full max-w-none"
          />
          <p className="home-mono mt-4 flex items-center justify-between gap-3">
            <span>15 NODES · RESPONSE GRID FEDERATION</span>
            <span>CONCEPTUAL</span>
          </p>
        </div>
      </div>
    </section>
  )
}