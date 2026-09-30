import { useState } from "react";
import { AuroraBackground } from "../components/ui/aurora-background";
import { MultiStepLoader } from "../components/ui/multi-step-loader";
import { SmoothScroll } from "../components/homepage/SmoothScroll";
import { PublicNav } from "../components/homepage/PublicNav";
import { HeroSection } from "../components/homepage/HeroSection";
import { ProblemSection } from "../components/homepage/ProblemSection";
import { WorkflowSection } from "../components/homepage/WorkflowSection";
import { ProductUISection } from "../components/homepage/ProductUISection";
import { SpatialSection } from "../components/homepage/SpatialSection";
import { TrustSection } from "../components/homepage/TrustSection";
import { RoleEntrySection } from "../components/homepage/RoleEntrySection";
import { FinalCta } from "../components/homepage/FinalCTA";
import { SiteFooter } from "../components/homepage/SiteFooter";

const LOADING_STAGES = [
  { text: "Initializing response layer" },
  { text: "Loading incident intelligence" },
  { text: "Syncing teams & resources" },
  { text: "Establishing operational view" },
  { text: "Ready for coordinated response" },
];

export function HomePage() {
  const [loading, setLoading] = useState(true);

  return (
    <div className="drcip-home min-h-screen relative">
      <MultiStepLoader
        loading={loading}
        loadingStates={LOADING_STAGES}
        duration={1400}
        onComplete={() => setLoading(false)}
      />
      <div className={loading ? "opacity-0" : "opacity-100"}>
        <AuroraBackground className="absolute inset-0 z-30" />
        <div className="relative z-10">
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-drcip-md focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-ink focus:shadow-drcip-md"
          >
            Skip to content
          </a>
          <SmoothScroll />
          <PublicNav start={!loading} />
          <main id="main-content">
            <HeroSection start={!loading} />
            <ProblemSection />
            <WorkflowSection />
            <ProductUISection />
            <SpatialSection />
            <TrustSection />
            <RoleEntrySection />
            <FinalCta />
          </main>
          <SiteFooter />
        </div>
      </div>
    </div>
  );
}

