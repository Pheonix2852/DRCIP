import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Button } from './ui/button'
import { Bell, User, LogOut, Menu } from 'lucide-react'
import { useState } from 'react'
import { Sheet, SheetContent } from './ui/sheet'

export function Layout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const navItems = [
    { label: 'Home', href: '/', roles: ['CITIZEN', 'FIELD_OFFICER', 'DISASTER_COORDINATOR', 'ADMINISTRATOR'] },
    { label: 'Report', href: '/report', roles: ['CITIZEN', 'FIELD_OFFICER'] },
    { label: 'My Incidents', href: '/incidents', roles: ['CITIZEN'] },
    { label: 'Command Center', href: '/dashboard', roles: ['DISASTER_COORDINATOR', 'ADMINISTRATOR'] },
    { label: 'Field', href: '/field', roles: ['FIELD_OFFICER'] },
    { label: 'My Team', href: '/field/team', roles: ['FIELD_OFFICER'] },
    { label: 'Assignments', href: '/field/assignments', roles: ['FIELD_OFFICER'] },
    { label: 'Field Update', href: '/field/update', roles: ['FIELD_OFFICER'] },
    { label: 'Resources', href: '/resources', roles: ['FIELD_OFFICER', 'DISASTER_COORDINATOR', 'ADMINISTRATOR'] },
    { label: 'Assignments', href: '/assignments', roles: ['DISASTER_COORDINATOR', 'ADMINISTRATOR'] },
    { label: 'Teams', href: '/teams', roles: ['DISASTER_COORDINATOR', 'ADMINISTRATOR'] },
    { label: 'Shelters', href: '/shelters', roles: ['DISASTER_COORDINATOR', 'ADMINISTRATOR'] },
    { label: 'Reports', href: '/reports', roles: ['DISASTER_COORDINATOR', 'ADMINISTRATOR'] },
    { label: 'RAG', href: '/rag', roles: ['FIELD_OFFICER', 'DISASTER_COORDINATOR', 'ADMINISTRATOR'] },
    { label: 'Admin', href: '/admin', roles: ['ADMINISTRATOR'] },
    { label: 'Health', href: '/health', roles: ['DISASTER_COORDINATOR', 'ADMINISTRATOR'] },
  ]

  const visibleItems = navItems.filter(item => user && item.roles.includes(user.role))

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 w-full border-b bg-card">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <Link to="/" className="flex items-center gap-2">
              <div className="h-8 w-8 rounded bg-drcip-primary flex items-center justify-center text-white font-bold">
                D
              </div>
              <span className="font-bold text-lg hidden sm:inline">DRCIP</span>
            </Link>
          </div>
          <nav className="hidden md:flex items-center gap-1">
            {visibleItems.map(item => (
              <Link key={item.href} to={item.href}>
                <Button
                  variant={location.pathname === item.href ? 'secondary' : 'ghost'}
                  size="sm"
                >
                  {item.label}
                </Button>
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon">
              <Bell className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon">
              <User className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={logout}>
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent className="w-64">
          <nav className="flex flex-col gap-1 mt-4">
            {visibleItems.map(item => (
              <Link key={item.href} to={item.href} onClick={() => setSidebarOpen(false)}>
                <Button
                  variant={location.pathname === item.href ? 'secondary' : 'ghost'}
                  className="w-full justify-start"
                >
                  {item.label}
                </Button>
              </Link>
            ))}
          </nav>
        </SheetContent>
      </Sheet>

      <main className="container px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}