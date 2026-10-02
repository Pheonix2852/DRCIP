import { Link } from 'react-router-dom'
import drcipLockup from '../../assets/brand/drcip-lockup.png'

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ block: 'start' })
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface-cool text-text-secondary">
      <div className="container-drcip flex flex-col gap-10 py-14 md:flex-row md:items-start md:justify-between">
        <div className="max-w-xs">
          <img src={drcipLockup} alt="DRCIP" className="h-7 w-auto" />
          <p className="mt-4 text-sm leading-relaxed">
            Disaster Response &amp; Resource Coordination Platform
          </p>
        </div>

        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-10 gap-y-3">
            {([
              { label: 'Product', id: 'product' },
              { label: 'How It Works', id: 'workflow' },
              { label: 'Trust', id: 'trust' },
            ] as const).map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => scrollToSection(l.id)}
                  className="min-h-11 px-1 text-sm font-medium text-text-secondary transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-electric"
                >
                  {l.label}
                </button>
              </li>
            ))}
            <li>
              <Link
                to="/login"
                className="inline-flex min-h-11 items-center px-1 text-sm font-medium text-text-secondary transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-electric"
              >
                Sign In
              </Link>
            </li>
          </ul>
        </nav>
      </div>

      <div className="border-t border-border">
        <div className="container-drcip flex flex-col gap-2 py-6 text-xs text-muted md:flex-row md:items-center md:justify-between">
          <p>© 2026 DRCIP</p>
          <p>Academic project demonstration.</p>
        </div>
      </div>
    </footer>
  )
}