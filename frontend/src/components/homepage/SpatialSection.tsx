import { Database, Layers, MapPin, Radar } from "lucide-react";
import { useReveal } from "./useReveal";
import { SectionHeading } from "./SectionHeading";
import { BentoGrid, BentoGridItem } from "../ui/bento-grid";
import feature_1 from "../../assets/homepage/features/feature_1.webp";
import feature_2 from "../../assets/homepage/features/feature_2.webp";
import feature_3 from "../../assets/homepage/features/feature_3.webp";
import feature_4 from "../../assets/homepage/features/feature_4.webp";
import feature_5 from "../../assets/homepage/features/feature_5.webp";

function TileHeader({ src }: { src: string }) {
  return (
    <div className="relative min-h-32 flex-1 overflow-hidden rounded-drcip-md border border-border">
      <img src={src} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" />
    </div>
  );
}

const ICON_CLASS = "h-4 w-4 text-cobalt-deep";

export function SpatialSection() {
  const ref = useReveal<HTMLElement>("pop");

  return (
    <section
      ref={ref}
      id="spatial"
      aria-labelledby="spatial-heading"
      className="scroll-mt-24 border-t border-border bg-surface-cool py-20 md:py-28"
    >
      <div className="container-drcip">
        <SectionHeading
          eyebrow="Spatial Intelligence"
          title="Geography at the center of every decision"
          description="DRCIP maps every incident, resource, team, and shelter in geographic space. Spatial queries find nearby resources. Coordinate-aware intelligence connects location to response. The map is not decoration — it is the operational field."
        />

        <div data-reveal className="mt-12">
          <BentoGrid>
            <BentoGridItem
              className="md:col-span-2"
              icon={<Radar className={ICON_CLASS} aria-hidden="true" />}
              title="Unified Incident Management"
              description="Report, triage, track and resolve incidents with precise locations and supporting media."
              header={<TileHeader src={feature_1} />}
            />
            <BentoGridItem
              icon={<Radar className={ICON_CLASS} aria-hidden="true" />}
              title="Field Execution"
              description="Manage field assignments, team status, progress updates and on-ground incident resolution."
              header={<TileHeader src={feature_3} />}
            />
            <BentoGridItem
              icon={<MapPin className={ICON_CLASS} aria-hidden="true" />}
              title="Spatial Intelligence"
              description="Visualize incidents, resources, shelters, severity and status through location-aware mapping."
              header={<TileHeader src={feature_4} />}
            />
            <BentoGridItem
              icon={<Layers className={ICON_CLASS} aria-hidden="true" />}
              title="Resource & Shelter Coordination"
              description="Locate, assign and track resources, teams, shelters, capacity and availability."
              header={<TileHeader src={feature_2} />}
            />
            <BentoGridItem
              icon={<Database className={ICON_CLASS} aria-hidden="true" />}
              title="Audit & Accountability"
              description="Maintain traceable decisions, assignment history, notifications, reports and administrative activity."
              header={<TileHeader src={feature_5} />}
            />
          </BentoGrid>
        </div>
      </div>
    </section>
  );
}
