import { FocusCards, type FocusCardItem } from '../ui/focus-cards'
import { useReveal } from './useReveal'
import { SectionHeading } from './SectionHeading'
import roleCitizen from '../../assets/homepage/role-citizen.webp'
import roleFieldOfficer from '../../assets/homepage/role-field-officer.webp'
import roleCoordinator from '../../assets/homepage/role-coordinator.webp'
import roleAdministrator from '../../assets/homepage/role-administrator.webp'

const ROLES: FocusCardItem[] = [
  {
    title: 'Citizen',
    description: 'Report incidents, attach photos and video, and track the status of your reports.',
    src: roleCitizen,
    link: '/login',
  },
  {
    title: 'Field Officer',
    description: 'Access your team dashboard, view assignments, and submit field status updates.',
    src: roleFieldOfficer,
    link: '/login',
  },
  {
    title: 'Disaster Coordinator',
    description: 'Monitor the command center, review AI recommendations, and coordinate resources and teams.',
    src: roleCoordinator,
    link: '/login',
  },
  {
    title: 'Administrator',
    description: 'Manage users, system configuration, and audit logs.',
    src: roleAdministrator,
    link: '/login',
  },
] as const

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

        <div data-reveal className="mt-14">
          <FocusCards cards={ROLES} />
        </div>
      </div>
    </section>
  )
}