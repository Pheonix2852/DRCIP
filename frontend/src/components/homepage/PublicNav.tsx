import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { cn } from '../../lib/utils'
import { Button } from '../../pages/ui/button'
import { Sheet, SheetContent } from '../../pages/ui/sheet'
import { primaryCtaClass } from './cta'
import drcipLockup from '../../assets/brand/drcip-lockup-horizontal.svg'

gsap.registerPlugin(useGSAP)

const SECTION_LINKS = [
  { label: 'Product', id: 'product' },
  { label: 'How It Works', id: 'workflow' },
  { label: 'Trust', id: 'trust' },
] as const

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ block: 'start' })
}

interface PublicNavLinkProps {
  id: string
  label: string
  onNavigate?: () => void
}

/** Hash-router-safe section scroll: a button (no href) so the route hash is never touched. */
function SectionLink({ id, label, onNavigate }: PublicNavLinkProps) {
  return (
    <button
      type="button"
      onClick={() => {
        scrollToSection(id)
        onNavigate?.()
      }}
      className="min-h-11 px-3 text-sm font-medium text-text-secondary transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-electric md:min-h-0 md:py-2"
    >
      {label}
    </button>
  )
}

export function PublicNav({ start }: { start: boolean }) {
  const navRef = useRef<HTMLElement>(null)
  const [open, setOpen] = useState(false)

  useGSAP(() => {
    if (!start) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    gsap.from('[data-nav-settle]', {
      y: -10,
      opacity: 0,
      duration: 0.5,
      ease: 'power2.out',
      stagger: 0.07,
    })
  }, { scope: navRef, dependencies: [start] })

  return (
    <header ref={navRef} className="nav-glass sticky top-0 z-40">
      <div className="container-drcip flex h-16 items-center justify-between gap-4">
        <Link to="/" aria-label="DRCIP home" className="flex items-center" data-nav-settle>
          <img src={drcipLockup} alt="DRCIP" className="h-7 w-auto" />
        </Link>

        <nav aria-label="Public" className="hidden items-center gap-1 md:flex" data-nav-settle>
          {SECTION_LINKS.map((link) => (
            <SectionLink key={link.id} {...link} />
          ))}
        </nav>

        <div className="hidden md:block" data-nav-settle>
          <Link to="/login" className={primaryCtaClass} data-testid="nav-sign-in">
            Sign In
          </Link>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 md:hidden"
          onClick={() => setOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={open}
          data-nav-settle
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </Button>
      </div>

      <Sheet open={open} onOpenChange={setOpen} label="Menu">
        <SheetContent className="p-0">
          <div className="flex h-full flex-col">
            <div className="flex h-16 items-center justify-between border-b border-border px-4">
              <img src={drcipLockup} alt="DRCIP" className="h-7 w-auto" />
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11"
                onClick={() => setOpen(false)}
                aria-label="Close navigation menu"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </Button>
            </div>
            <nav aria-label="Public" className="flex flex-col gap-1 p-4">
              {SECTION_LINKS.map((link) => (
                <SectionLink
                  key={link.id}
                  {...link}
                  onNavigate={() => setOpen(false)}
                />
              ))}
              <Link
                to="/login"
                onClick={() => setOpen(false)}
                className={cn(primaryCtaClass, 'mt-2 w-full')}
              >
                Sign In
              </Link>
            </nav>
          </div>
        </SheetContent>
      </Sheet>
    </header>
  )
}