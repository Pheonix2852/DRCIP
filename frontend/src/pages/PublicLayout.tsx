import { Outlet } from 'react-router-dom'

/**
 * Public shell for the unauthenticated product surface. Completely separate
 * from the authenticated Layout — the homepage never renders its sidebar/header.
 */
export function PublicLayout() {
  return <Outlet />
}