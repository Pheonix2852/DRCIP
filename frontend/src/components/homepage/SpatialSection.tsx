import { useReveal } from './useReveal'
import { SectionHeading } from './SectionHeading'
import gridSvg from '../../assets/homepage/spatial/drcip-grid.svg'
import mapOutlineSvg from '../../assets/homepage/spatial/drcip-map-outline.svg'
import convergenceSvg from '../../assets/homepage/spatial/drcip-convergence-paths.svg'

const POINTS = [
  'Incidents geotagged with precise coordinates via map pin',
  'Proximity-based resource and shelter discovery',
  'Interactive map with severity and status overlays',
] as const

const ANNOTATIONS = [
  { label: 'ZONE A · EVAC', left: '18%', top: '66%' },
  { label: 'TEAM T-03 · 1.8 KM', left: '68%', top: '30%' },
] as const

export function SpatialSection() {
  const ref = useReveal<HTMLElement>()

  return (
    <section
      ref={ref}
      aria-labelledby="spatial-heading"
      className="border-t border-border bg-surface-cool py-20 md:py-28"
    >
      <div className="container-drcip">
        <SectionHeading
          eyebrow="Spatial Intelligence"
          title="Geography at the center of every decision"
          description="DRCIP maps every incident, resource, team, and shelter in geographic space. Spatial queries find nearby resources. Coordinate-aware intelligence connects location to response. The map is not decoration — it is the operational field."
        />

        <div className="mt-12 grid items-stretch gap-8 lg:grid-cols-12" data-reveal>
          <div className="relative overflow-hidden rounded-drcip-lg border border-border bg-surface shadow-drcip-md lg:col-span-7">
            <img src={gridSvg} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover opacity-25" />
            <img src={mapOutlineSvg} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-contain opacity-20" />
            <img src={convergenceSvg} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-contain opacity-15" />

            <span aria-hidden="true" className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-cobalt-deep/50" />
            <span aria-hidden="true" className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cobalt-electric" />
            <span className="home-mono absolute left-4 top-4 rounded-drcip-sm bg-surface/85 px-2.5 py-1.5">
              23.0225° N · 72.5714° E
            </span>

            {ANNOTATIONS.map((a) => (
              <span
                key={a.label}
                className="home-mono absolute rounded-drcip-sm bg-surface/85 px-2.5 py-1.5"
                style={{ left: a.left, top: a.top }}
              >
                {a.label}
              </span>
            ))}

            <p className="absolute bottom-4 left-4 right-3 flex items-center justify-between gap-3">
              <span className="home-mono">POSTGIS · RESPONSE GRID 04</span>
              <span className="home-mono">ARANYA DISTRICT</span>
            </p>
          </div>

          <div className="flex lg:col-span-5">
            <ol className="flex w-full flex-col justify-center gap-0">
              {POINTS.map((point, i) => (
                <li key={point} className="border-t border-border py-5 first:border-t-0 md:py-6">
                  <div className="flex items-baseline gap-4">
                    <span className="home-mono">{String(i + 1).padStart(2, '0')}</span>
                    <p className="text-[15px] leading-relaxed text-ink">{point}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  )
}