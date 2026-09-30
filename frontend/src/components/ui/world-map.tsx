import { useMemo } from "react"
import DottedMap from "dotted-map"
import { MapPin } from "lucide-react"
import { cn } from "@/lib/utils"

export interface WorldLocation {
  lat: number
  lng: number
  label: string
}

interface WorldMapProps {
  locations: WorldLocation[]
  className?: string
}

/**
 * Light-only dotted world map (no theme switching). Dot grid is rendered as a
 * data-URI SVG; pins are positioned from `dotted-map` projection coordinates.
 */
export function WorldMap({ locations, className }: WorldMapProps) {
  const map = useMemo(() => new DottedMap({ height: 100, grid: "diagonal" }), [])

  const svgDataUri = useMemo(() => {
    const svg = map.getSVG({
      shape: "circle",
      color: "#D3DDE8",
      radius: 0.22,
      backgroundColor: "transparent",
    })
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
  }, [map])

  const pins = useMemo(() => {
    const { width, height } = map.image
    return locations.map((loc) => {
      const point = map.getPin({ lat: loc.lat, lng: loc.lng })
      if (!point) return null
      return { ...loc, top: (point.y / height) * 100, left: (point.x / width) * 100 }
    })
  }, [locations, map])

  return (
    <div
      className={cn("relative w-full overflow-hidden rounded-drcip-md border border-border bg-surface", className)}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,rgba(47,104,240,0.18),transparent_60%)]"
      />
      <img
        src={svgDataUri}
        alt=""
        aria-hidden="true"
        className="relative h-full w-full object-cover"
        draggable={false}
      />
      {pins.map(
        (pin) =>
          pin && (
            <div
              key={pin.label}
              role="img"
              aria-label={pin.label}
              className="absolute z-10 -translate-x-1/2 -translate-y-full"
              style={{ top: `${pin.top}%`, left: `${pin.left}%` }}
            >
              <MapPin aria-hidden="true" className="h-5 w-5 text-cobalt-deep drop-shadow-sm" strokeWidth={2.2} />
              <span className="sr-only">{pin.label}</span>
            </div>
          ),
      )}
    </div>
  )
}