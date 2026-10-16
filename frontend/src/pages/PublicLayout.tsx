import { Outlet } from 'react-router-dom'
import { RouteDocumentTitle } from '../components'

/**
 * Public shell for the unauthenticated product surface. Completely separate
 * from the authenticated Layout — the homepage never renders its sidebar/header.
 */
export function PublicLayout() {
  return (
    <>
      <RouteDocumentTitle />
      <Outlet />
    </>
  )
}