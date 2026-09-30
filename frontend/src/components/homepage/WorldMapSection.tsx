import { useReveal } from "./useReveal";
import { SectionHeading } from "./SectionHeading";
import { WorldMap, type WorldLocation } from "../ui/world-map";

const NODES: WorldLocation[] = [
  // North America
  { lat: 40.7128, lng: -74.006, label: "New York" },

  // South America
  { lat: -23.5505, lng: -46.6333, label: "São Paulo" },

  // Europe
  { lat: 51.5074, lng: -0.1278, label: "London" },

  // Africa
  { lat: 6.5244, lng: 3.3792, label: "Lagos" },
  { lat: -33.9249, lng: 18.4241, label: "Cape Town" },

  // Middle East
  { lat: 25.2048, lng: 55.2708, label: "Dubai" },

  // South Asia
  { lat: 28.6139, lng: 77.209, label: "New Delhi" },

  // East Asia
  { lat: 35.6762, lng: 139.6503, label: "Tokyo" },

  // Southeast Asia
  { lat: 1.3521, lng: 103.8198, label: "Singapore" },

  // Australia / Oceania
  { lat: -33.8688, lng: 151.2093, label: "Sydney" },

  // Additional North America
  { lat: 61.2181, lng: -149.9003, label: "Anchorage" },

  // Additional North America
  { lat: 32.5149, lng: -117.0382, label: "Tijuana" },

  // Additional South America
  { lat: -54.8019, lng: -68.303, label: "Ushuaia" },
];

// Cross-region connections to make the global distribution visually obvious.
const CONNECTIONS: { start: number; end: number }[] = [
  { start: 10, end: 0 }, // Anchorage ↔ New York
  { start: 11, end: 0 }, // Tijuana ↔ New York
  { start: 0, end: 2 }, // New York ↔ London
  { start: 11, end: 1 }, // Tijuana ↔ São Paulo
  { start: 12, end: 1 }, // Ushuaia ↔ São Paulo
  { start: 1, end: 2 }, // São Paulo ↔ London

  { start: 2, end: 3 }, // London ↔ Lagos
  { start: 3, end: 4 }, // Lagos ↔ Cape Town
  { start: 4, end: 5 }, // Cape Town ↔ Dubai
  { start: 5, end: 6 }, // Dubai ↔ New Delhi

  { start: 6, end: 7 }, // New Delhi ↔ Tokyo
  { start: 7, end: 8 }, // Tokyo ↔ Singapore
  { start: 8, end: 9 }, // Singapore ↔ Sydney

  { start: 0, end: 7 }, // New York ↔ Tokyo
];

export function WorldMapSection() {
  const ref = useReveal<HTMLElement>();

  return (
    <section ref={ref} aria-labelledby="world-map-heading" className="border-t border-border bg-canvas py-20 md:py-28">
      <div className="container-drcip">
        <SectionHeading
          eyebrow="Global Coordination"
          title="The same operational model, everywhere"
          description="A global response network — not a live map. Illustrative nodes show how relief operations coordinate across every continent."
        />

        <div data-reveal className="mt-12">
          <div className="rounded-drcip-lg border border-border bg-surface p-3 shadow-sm md:p-6">
            <div className="relative overflow-hidden rounded-drcip-md bg-[#F5F7FA] px-1 pt-8 md:pt-12">
              <WorldMap locations={NODES} connections={CONNECTIONS} className="aspect-[2/1] w-full" />
            </div>
            <p className="home-mono mt-3 text-xs text-text-muted">
              Illustrative global coordination points — not operational telemetry.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
