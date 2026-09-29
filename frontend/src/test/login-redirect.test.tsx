import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { Role } from '@drcip/contracts'

const mockLogin = vi.fn()

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ login: mockLogin }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { LoginPage } from '../pages/LoginPage'

function LocationDisplay() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}</div>
}

function renderLogin() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
        <LocationDisplay />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const ROLE_CASES: { role: Role; home: string }[] = [
  { role: 'CITIZEN', home: '/report' },
  { role: 'FIELD_OFFICER', home: '/field' },
  { role: 'DISASTER_COORDINATOR', home: '/dashboard' },
  { role: 'ADMINISTRATOR', home: '/admin' },
]

describe('LoginPage — post-login redirect', () => {
  beforeEach(() => {
    mockLogin.mockReset()
  })

  for (const { role, home } of ROLE_CASES) {
    it(`navigates to ${home} after ${role} login`, async () => {
      const user = userEvent.setup()
      mockLogin.mockResolvedValue({ id: 'u1', name: 'Test', role, is_active: true, created_at: '' })
      renderLogin()

      await user.type(screen.getByLabelText('Email'), 'test@example.com')
      await user.type(screen.getByLabelText('Password'), 'password123')
      await user.click(screen.getByRole('button', { name: 'Sign In' }))

      await waitFor(() => {
        expect(screen.getByTestId('location').textContent).toBe(home)
      })
    })
  }

  it('stays on /login after failed login', async () => {
    const user = userEvent.setup()
    mockLogin.mockRejectedValue(new Error('Invalid credentials'))
    renderLogin()

    await user.type(screen.getByLabelText('Email'), 'bad@example.com')
    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Sign In' }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid credentials')
    })
    expect(screen.getByTestId('location').textContent).toBe('/login')
  })
})
