import { useState } from 'react'
import { DrcipLoader } from '../components/DrcipLoader'
import { PublicNav } from '../components/homepage/PublicNav'
import { HeroSection } from '../components/homepage/HeroSection'
import { ProblemSection } from '../components/homepage/ProblemSection'
import { WorkflowSection } from '../components/homepage/WorkflowSection'
import { ProductUISection } from '../components/homepage/ProductUISection'
import { SpatialSection } from '../components/homepage/SpatialSection'
import { TrustSection } from '../components/homepage/TrustSection'
import { RoleEntrySection } from '../components/homepage/RoleEntrySection'
import { FinalCta } from '../components/homepage/FinalCTA'
import { SiteFooter } from '../components/homepage/SiteFooter'

const LOADER_SEEN = 'drcip-loader-seen'

export function HomePage() {
  // First visit gates the hero behind the loader (heavy entrance); repeat
  // visits start already "loaded" so the hero plays a light reveal instead.
  const [loaded, setLoaded] = useState(() => sessionStorage.getItem(LOADER_SEEN) === '1')

  return (
    <div className="drcip-home min-h-screen">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-drcip-md focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-ink focus:shadow-drcip-md"
      >
        Skip to content
      </a>
      <DrcipLoader onDone={() => setLoaded(true)} />
      <PublicNav start={loaded} />
      <main id="main-content">
        <HeroSection start={loaded} />
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
  )
}