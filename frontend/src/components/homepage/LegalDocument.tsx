import { Link } from 'react-router-dom'
import { AuroraBackground } from '../ui/aurora-background'
import { SiteFooter } from './SiteFooter'
import { secondaryCtaClass } from './cta'

export interface LegalDocumentProps {
  eyebrow?: string
  title: string
  intro: string
  points: readonly string[]
  updated: string
}

/**
 * Shared public-site shell + editorial document layout for the legal pages
 * (Privacy, Terms). Reuses the homepage chrome — ResizableNavbar, SiteFooter,
 * AuroraBackground — and the homepage editorial material (`.drcip-home` tokens,
 * `home-eyebrow` / `home-h2` / `home-lede` / `home-mono`, `container-drcip`,
 * capsule CTA) so these read as native DRCIP sections, not standalone documents.
 *
 * The title is the page's single `<h1>` (strong, editorial) — the homepage
 * `SectionHeading` is not reused here because it hard-codes an `<h2>`.
 */
export function LegalDocument({ eyebrow = 'Legal', title, intro, points, updated }: LegalDocumentProps) {
  return (
    <div className="drcip-home relative min-h-screen">
      <AuroraBackground className="absolute inset-0 z-30" />
      <div className="relative z-10 flex min-h-screen flex-col">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-drcip-md focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-ink focus:shadow-drcip-md"
        >
          Skip to content
        </a>


        <main id="main-content" className="flex-1">
          <section className="border-b border-border bg-canvas">
            <div className="container-drcip py-16 md:py-24">
              <div className="max-w-3xl">
                <p className="home-eyebrow">{eyebrow}</p>
                <h1 className="home-h2 mt-4">{title}</h1>
                <p className="home-lede">{intro}</p>
                <p className="home-mono mt-5">Last updated: {updated}</p>
              </div>
            </div>
          </section>

          <section className="bg-surface-cool py-16 md:py-24">
            <div className="container-drcip">
              <ul className="max-w-3xl border-t border-border">
                {points.map((point, i) => (
                  <li
                    key={point}
                    className="grid grid-cols-[2.5rem_1fr] gap-x-3 border-b border-border py-5"
                  >
                    <span className="home-mono text-text-muted">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <p className="text-base leading-relaxed text-text-secondary">{point}</p>
                  </li>
                ))}
              </ul>

              <div className="mt-12">
                <Link to="/" className={secondaryCtaClass}>
                  <span aria-hidden="true">←</span>
                  Back to DRCIP
                </Link>
              </div>
            </div>
          </section>
        </main>

        <SiteFooter />
      </div>
    </div>
  )
}
