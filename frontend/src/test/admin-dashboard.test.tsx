import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

const authState = { role: 'ADMINISTRATOR' as string | undefined }

vi.mock('../lib/admin', () => ({
  admin: {
    overview: vi.fn().mockResolvedValue({
      users: { total: 10, active: 8, by_role: { ADMINISTRATOR: 1, CITIZEN: 9 } },
      incidents: { total: 4 },
      resources: { total: 7 },
      teams: { total: 3, active: 2 },
      shelters: { total: 2 },
      health: { status: 'ok', timestamp: '2026-09-27T12:00:00Z' },
      rag: {
        status: 'deferred',
        documents_total: 0,
        documents_pending_approval: 0,
        message: 'RAG implementation is deferred.',
      },
      configuration: { status: 'ok', message: 'Core services operational.' },
      recent_audit: [],
    }),
  },
}))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: authState.role ? { role: authState.role } : null, wsStatus: 'open', ws: null }),
}))

import { AdminDashboard } from '../pages/AdminDashboard'

function renderDashboard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  authState.role = 'ADMINISTRATOR'
})

afterEach(() => cleanup())

describe('AdminDashboard entry point', () => {
  it('mounts and renders KPI metrics for an administrator', async () => {
    renderDashboard()
    expect(await screen.findByText('Active Users')).toBeTruthy()
    expect(screen.getByText('Total Users')).toBeTruthy()
    expect(screen.getByText('User Roles')).toBeTruthy()
    expect(await screen.findByText('8')).toBeTruthy()
  })

  it('denies access to a non-administrator', async () => {
    authState.role = 'CITIZEN'
    renderDashboard()
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByText(/Access denied/)).toBeTruthy()
  })
})
