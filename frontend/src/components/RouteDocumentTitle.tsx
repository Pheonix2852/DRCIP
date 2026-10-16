import { matchPath, useLocation } from 'react-router-dom'
import { useDocumentTitle } from '../lib/document-title'

const SITE_TITLE = 'DRCIP - Disaster Response & Coordination Platform'

const ROUTE_TITLES: { pattern: string; title: string }[] = [
  { pattern: '/', title: SITE_TITLE },
  { pattern: '/login', title: 'Sign in · DRCIP' },
  { pattern: '/reset-password', title: 'Reset password · DRCIP' },
  { pattern: '/privacy', title: 'Privacy Policy · DRCIP' },
  { pattern: '/terms', title: 'Terms & Conditions · DRCIP' },
  { pattern: '/report', title: 'Report Incident · DRCIP' },
  { pattern: '/incidents', title: 'My Incidents · DRCIP' },
  { pattern: '/incidents/:id/review', title: 'Review Incident · DRCIP' },
  { pattern: '/incidents/:id', title: 'Incident Details · DRCIP' },
  { pattern: '/notifications', title: 'Notifications · DRCIP' },
  { pattern: '/profile', title: 'Profile · DRCIP' },
  { pattern: '/dashboard', title: 'Dashboard · DRCIP' },
  { pattern: '/assignments', title: 'Assignments · DRCIP' },
  { pattern: '/teams', title: 'Teams · DRCIP' },
  { pattern: '/shelters', title: 'Shelters · DRCIP' },
  { pattern: '/reports', title: 'Reports · DRCIP' },
  { pattern: '/resources', title: 'Resources · DRCIP' },
  { pattern: '/admin', title: 'Admin Overview · DRCIP' },
  { pattern: '/admin/users', title: 'Users · DRCIP' },
  { pattern: '/admin/health', title: 'System Health · DRCIP' },
  { pattern: '/admin/audit', title: 'Audit Log · DRCIP' },
  { pattern: '/admin/rag', title: 'RAG Assistant · DRCIP' },
  { pattern: '/rag', title: 'RAG Assistant · DRCIP' },
  { pattern: '/field', title: 'Field Dashboard · DRCIP' },
  { pattern: '/field/team', title: 'My Team · DRCIP' },
  { pattern: '/field/assignments', title: 'My Assignments · DRCIP' },
  { pattern: '/field/update', title: 'Field Update · DRCIP' },
]

export function RouteDocumentTitle(): null {
  const { pathname } = useLocation()
  const match = ROUTE_TITLES.find((r) => matchPath({ path: r.pattern, end: true }, pathname))
  useDocumentTitle(match?.title ?? SITE_TITLE)
  return null
}
