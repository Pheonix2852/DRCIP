import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function PrivateRoute() {
  const { isAuthenticated, isInitialized } = useAuth()

  // Wait for the stored-session restore before deciding — otherwise a page
  // refresh flashes a redirect to /login while a valid token is still loading.
  if (!isInitialized) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
        Restoring session…
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}