import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi, describe, it, expect } from 'vitest'
import { Role } from '@drcip/contracts'

const authState = { role: null as Role | null, isAuthenticated: true, isInitialized: true }

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    isAuthenticated: authState.isAuthenticated,
    isInitialized: authState.isInitialized,
    hasRole: (roles: Role[]) => !!authState.role && roles.includes(authState.role),
  }),
}))

import { RoleRoute } from '../components/RoleRoute'
import { PrivateRoute } from '../components/PrivateRoute'

function renderGuards() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/" element={<div>Public home</div>} />
        <Route path="/login" element={<div>Login page</div>} />
        <Route element={<RoleRoute allowedRoles={['DISASTER_COORDINATOR', 'ADMINISTRATOR']} />}>
          <Route path="/dashboard" element={<div>Coordinator portal</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

function renderPrivate() {
  return render(
    <MemoryRouter initialEntries={['/notifications']}>
      <Routes>
        <Route path="/" element={<div>Public home</div>} />
        <Route path="/login" element={<div>Login page</div>} />
        <Route element={<PrivateRoute />}>
          <Route path="/notifications" element={<div>Private page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('Role guard + post-login redirect integrity', () => {
  it('blocks a CITIZEN from the Coordinator portal (redirects to home)', () => {
    authState.role = 'CITIZEN'
    renderGuards()
    expect(screen.queryByText('Coordinator portal')).not.toBeInTheDocument()
    expect(screen.getByText('Public home')).toBeInTheDocument()
  })

  it('blocks a FIELD_OFFICER from the Coordinator portal (redirects to home)', () => {
    authState.role = 'FIELD_OFFICER'
    renderGuards()
    expect(screen.queryByText('Coordinator portal')).not.toBeInTheDocument()
    expect(screen.getByText('Public home')).toBeInTheDocument()
  })

  it('allows a DISASTER_COORDINATOR into the Coordinator portal', () => {
    authState.role = 'DISASTER_COORDINATOR'
    renderGuards()
    expect(screen.getByText('Coordinator portal')).toBeInTheDocument()
    expect(screen.queryByText('Public home')).not.toBeInTheDocument()
  })

  it('allows an ADMINISTRATOR into the Coordinator portal', () => {
    authState.role = 'ADMINISTRATOR'
    renderGuards()
    expect(screen.getByText('Coordinator portal')).toBeInTheDocument()
  })

  it('redirects an unauthenticated user to /login for a private route', () => {
    authState.isAuthenticated = false
    renderPrivate()
    expect(screen.getByText('Login page')).toBeInTheDocument()
    expect(screen.queryByText('Private page')).not.toBeInTheDocument()
  })
})