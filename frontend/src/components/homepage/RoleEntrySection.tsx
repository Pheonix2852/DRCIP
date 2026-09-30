import { Link } from 'react-router-dom'
import { HardHat, LayoutDashboard, ShieldCheck, UserRound } from 'lucide-react'
import { useReveal } from './useReveal'
import { SectionHeading } from './SectionHeading'

const ROLES = [
  {
    role: 'Citizen',
    description: 'Report incidents, attach photos and video, and track the status of your reports.',
    Icon: UserRound,
  },
  {
    role: 'Field Officer',
    description: 'Access your team dashboard, view assignments, and submit field status updates.',
    Icon: HardHat,
  },
  {
    role: 'Disaster Coordinator',
    description: 'Monitor the command center, review AI recommendations, and coordinate resources and teams.',
    Icon: LayoutDashboard,
  },
  {
    role: 'Administrator',
    description: 'Manage users, system configuration, and audit logs.',
    Icon: ShieldCheck,
  },
] as const

/**
 * Shared card model: icon row + name + description, with the CTA pinned to
 * the bottom via the description's flex-grow — every Sign In link sits on
 * one baseline across the row. No margin hacks.
 */
function RoleCard({ role, description, Icon }: (typeof ROLES)[number]) {
  return (
    <li data-reveal data-testid="role-card" className="role-card flex flex-col border-t border-border pt-7 lg:border-l lg:border-t-0 lg:px-7 lg:pt-0 first:lg:border-l-0 first:lg:pl-0 lg:last:pr-0">
      <span className="flex h-11 w-11 items-center justify-center rounded-drcip-md border border-border bg-surface">
        <Icon className="h-5 w-5 text-cobalt-deep" aria-hidden="true" />
      </span>
      <h3 className="mt-5 text-lg font-medium tracking-tight text-ink">{role}</h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-text-secondary">{description}</p>
      <Link
        to="/login"
        className="mt-6 inline-flex min-h-11 items-center justify-start gap-1.5 self-start text-sm font-medium text-cobalt-deep transition-colors hover:text-cobalt-electric focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-electric"
      >
        Sign In <span className="role-cta-arrow" aria-hidden="true">→</span>
      </Link>
    </li>
  )
}

export function RoleEntrySection() {
  const ref = useReveal<HTMLElement>()

  return (
    <section
      ref={ref}
      id="roles"
      aria-labelledby="roles-heading"
      className="scroll-mt-24 border-t border-border bg-surface-cool py-20 md:py-28"
    >
      <div className="container-drcip">
        <SectionHeading
          eyebrow="Choose Your Portal"
          title="Enter the platform"
          description="Accounts are provisioned by an administrator. Sign in with the portal credentials issued to your role."
          align="center"
        />

        <ul
          className="mt-14 grid grid-cols-1 gap-x-12 gap-y-10 sm:grid-cols-2 lg:grid-cols-4"
        >
          {ROLES.map((role) => (
            <RoleCard key={role.role} {...role} />
          ))}
        </ul>
      </div>
    </section>
  )
}