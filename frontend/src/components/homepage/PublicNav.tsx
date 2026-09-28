import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import { cn } from '../../lib/utils'
import { Button } from '../../pages/ui/button'
import { Drawer, DrawerContent, DrawerTitle } from '../../pages/ui/drawer'
import { primaryCtaClass } from './cta'
import { prefersReducedMotion, scrollToSection } from './homeMotion'
import drcipLockup from '../../assets/brand/drcip-lockup-horizontal.svg'

gsap.registerPlugin(useGSAP)

const SECTION_LINKS = [
  { label: 'Product', id: 'product' },
  { label: 'How It Works', id: 'workflow' },
  { label: 'Trust', id: 'trust' },
] as const

interface PublicNavLinkProps {
  id: string
  label: string
  active?: boolean
  onNavigate?: () => void
}

/** Hash-router-safe section scroll: a button (no href) so the route hash is never touched. */
function SectionLink({ id, label, active, onNavigate }: PublicNavLinkProps) {
  return (
    <button
      type="button"
      onClick={() => {
        scrollToSection(id)
        onNavigate?.()
      }}
      className={cn(
        'min-h-11 px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-electric md:min-h-0 md:py-2',
        active ? 'nav-link-active text-cobalt-deep' : 'text-text-secondary hover:text-ink',
      )}
    >
      {label}
    </button>
  )
}

export function PublicNav({ start }: { start: boolean }) {
  const navRef = useRef<HTMLElement>(null)
  const [open, setOpen] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)

  // Lightweight scroll-spy: IntersectionObserver on each section
  useEffect(() => {
    if (!start) return
    if (prefersReducedMotion()) return
    const ids = SECTION_LINKS.map((l) => l.id)
    const observers: IntersectionObserver[] = []

    ids.forEach((id) => {
      const el = document.getElementById(id)
      if (!el) return
      const io = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActiveId(id)
        },
        { rootMargin: '-40% 0px -40% 0px' },
      )
      io.observe(el)
      observers.push(io)
    })

    return () => observers.forEach((io) => io.disconnect())
  }, [start])

  useGSAP(() => {
    if (!start) return
    if (prefersReducedMotion()) return
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
            <SectionLink key={link.id} {...link} active={activeId === link.id} />
          ))}
        </nav>

        <div className="hidden md:block" data-nav-settle>
          <Link to="/login" className={cn(primaryCtaClass, 'nav-sign-in')} data-testid="nav-sign-in">
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

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent
          className="pb-6 outline-none"
          aria-describedby={undefined}
        >
          <DrawerTitle className="sr-only">Public navigation</DrawerTitle>
          <div className="px-4 pt-2">
            <div className="flex h-12 items-center justify-between border-b border-border">
              <img src={drcipLockup} alt="DRCIP" className="h-6 w-auto" />
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
            <nav aria-label="Public" className="flex flex-col gap-1 pt-2">
              {SECTION_LINKS.map((link) => (
                <SectionLink key={link.id} {...link} onNavigate={() => setOpen(false)} />
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
        </DrawerContent>
      </Drawer>
    </header>
  )
}